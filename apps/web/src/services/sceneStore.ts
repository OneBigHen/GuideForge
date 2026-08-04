/**
 * Scene store for apps/web: persists a serializable SceneState per guide in
 * Dexie, applies scene commands through the pure reducer, and exposes an
 * asset URL resolver for GLB loading by content hash.
 *
 * A dedicated Dexie database ('guideforge-scenes') keeps storage-web
 * framework-independent.
 */
import type { GuideCommand } from '@guideforge/commands';
import {
  applySceneCommand,
  createSceneState,
  evaluateSceneHealth,
  type SceneState,
} from '@guideforge/scene-core';
import Dexie from 'dexie';

export interface SerializedScene {
  nodes: Record<string, SceneState['nodes'] extends Map<string, infer N> ? N : never>;
  rootOrder: string[];
  layers: Record<string, { name: string; visible: boolean; locked: boolean; color: string }>;
  cameras: SceneState['cameras'];
  measurements: SceneState['measurements'];
}

const sceneDb = new Dexie('guideforge-scenes');
sceneDb.version(1).stores({
  scenes: 'guideId, updatedAtIso',
});

interface SceneRow {
  guideId: string;
  scene: SerializedScene;
  updatedAtIso: string;
}

export async function loadScene(guideId: string): Promise<SceneState> {
  const row = await sceneDb.table<SceneRow, string>('scenes').get(guideId);
  if (!row) return createSceneState();
  return deserializeScene(row.scene);
}

export async function saveScene(guideId: string, scene: SceneState): Promise<void> {
  const row: SceneRow = {
    guideId,
    scene: serializeScene(scene),
    updatedAtIso: new Date().toISOString(),
  };
  await sceneDb.table<SceneRow, string>('scenes').put(row);
}

export async function dispatchSceneCommand(
  guideId: string,
  command: GuideCommand,
): Promise<SceneState> {
  const current = await loadScene(guideId);
  const next = applySceneCommand(current, command);
  await saveScene(guideId, next);
  return next;
}

export function sceneHealth(scene: SceneState) {
  return evaluateSceneHealth(scene);
}

function serializeScene(scene: SceneState): SerializedScene {
  return {
    nodes: Object.fromEntries(scene.nodes),
    rootOrder: [...scene.rootOrder],
    layers: Object.fromEntries(scene.layers),
    cameras: scene.cameras.map((c) => ({
      ...c,
      position: { ...c.position },
      target: { ...c.target },
    })),
    measurements: scene.measurements.map((m) => ({ ...m })),
  };
}

function deserializeScene(serialized: SerializedScene): SceneState {
  return {
    nodes: new Map(
      Object.entries(serialized.nodes ?? {}).map(([id, n]) => [
        id as SceneState['nodes'] extends Map<infer K, unknown> ? K : never,
        n,
      ]),
    ),
    rootOrder: [...(serialized.rootOrder ?? [])] as SceneState['rootOrder'],
    layers: new Map(Object.entries(serialized.layers ?? {})),
    cameras: (serialized.cameras ?? []).map((c) => ({
      ...c,
      position: { ...c.position },
      target: { ...c.target },
    })),
    measurements: (serialized.measurements ?? []).map((m) => ({ ...m })),
  };
}

/** Resolve a GLB asset hash to a usable URL (stored object URLs). */
export function makeAssetUrlResolver(
  objectUrls: Map<string, string>,
): (hash: string) => string | null {
  return (hash: string) => objectUrls.get(hash) ?? null;
}
