/**
 * Scene store for apps/web.
 *
 * The canonical scene lives INSIDE the working Yjs document
 * (`working.scene`), so it is collaborative, packaged, imported, and always
 * consistent with the guide snapshot. Dexie is NOT authoritative for scenes
 * anymore (Phase 02); this module only adapts the Yjs document.
 */
import {
  guideSceneToSceneState,
  materializeScene,
  sceneStateToGuideScene,
  setWorkingScene,
} from '@guideforge/collaboration';
import type { GuideCommand } from '@guideforge/commands';
import { applySceneCommand, type SceneState } from '@guideforge/scene-core';
import type { OpenGuideSession } from './guideStore';

/** Load the canonical scene from the working document (never a separate DB). */
export function loadScene(session: OpenGuideSession): SceneState {
  return guideSceneToSceneState(materializeScene(session.working));
}

/** Apply a scene command inside the working document (one semantic commit). */
export function dispatchSceneCommand(session: OpenGuideSession, command: GuideCommand): SceneState {
  const current = loadScene(session);
  const next = applySceneCommand(current, command);
  if (next === current) return current;
  const anchors = materializeScene(session.working).anchors;
  session.working.doc.transact(() => {
    setWorkingScene(session.working, sceneStateToGuideScene(next, anchors));
  }, 'guideforge:scene-command');
  return next;
}

/** Set the whole scene (used by import/hydrate paths). */
export function saveSceneToWorkingDoc(session: OpenGuideSession, scene: SceneState): void {
  const anchors = materializeScene(session.working).anchors;
  session.working.doc.transact(() => {
    setWorkingScene(session.working, sceneStateToGuideScene(scene, anchors));
  }, 'guideforge:scene-set');
}

export { createSceneState } from '@guideforge/scene-core';

/** Resolve a GLB asset hash to a usable URL (stored object URLs). */
export function makeAssetUrlResolver(
  objectUrls: Map<string, string>,
): (hash: string) => string | null {
  return (hash: string) => objectUrls.get(hash) ?? null;
}
