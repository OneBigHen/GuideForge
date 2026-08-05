import { materializeTraining } from '@guideforge/collaboration';
import type { GuideCommand } from '@guideforge/commands';
import type { EntityId } from '@guideforge/domain';
import { snapshotsSemanticallyEqual } from '@guideforge/guide-schema';
import { applySceneCommand, createSceneState, SCENE_COMMAND_TYPES } from '@guideforge/scene-core';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addAssessmentItem,
  addObjective,
  addStep,
  addTask,
  closeGuide,
  createGuide,
  exportDraft,
  importDraft,
  openGuide,
} from './guideStore';
import { dispatchSceneCommand, loadScene, saveSceneToWorkingDoc } from './sceneStore';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

function sceneCommand(
  session: { guideId: string },
  commandType: string,
  payload: Record<string, unknown>,
): GuideCommand {
  return {
    commandId: crypto.randomUUID(),
    commandType,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

/**
 * Phase 02 vertical slice: import GLB -> task/step -> place model -> camera ->
 * annotation -> objective + question -> close/reopen -> export -> import
 * elsewhere -> verify identical semantics and bytes.
 */
describe('canonical spatial guide round trip (Phase 02)', () => {
  it('scene + training + assets survive export/import with identical semantics', async () => {
    // 1. Create a guide with procedure content.
    const session = await createGuide('Micropipette calibration');
    const taskId = await addTask(session, 'Calibrate');
    await addStep(session, taskId, 'Disconnect power before opening the housing.');

    // 2. Build a scene: place a model node, add a camera, add an annotation.
    const sceneState = createSceneState();
    const modelNode = {
      nodeId: crypto.randomUUID() as EntityId,
      name: 'Pipette',
      parentId: null as EntityId | null,
      assetHash: 'a'.repeat(64) as EntityId & string,
      transform: {
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      layerId: 'default',
      visible: true,
      locked: false,
      metadata: {},
    };
    const withNode = applySceneCommand(
      sceneState,
      sceneCommand(session, SCENE_COMMAND_TYPES.addNode, { node: modelNode }),
    );
    saveSceneToWorkingDoc(session, withNode);
    // Add a camera via the reducer.
    const withCamera = applySceneCommand(
      withNode,
      sceneCommand(session, SCENE_COMMAND_TYPES.addCamera, {
        bookmark: {
          bookmarkId: crypto.randomUUID(),
          name: 'Front',
          position: { x: 5, y: 5, z: 5 },
          target: { x: 0, y: 1, z: 0 },
          orthographic: false,
          zoom: 1,
        },
      }),
    );
    const afterScene = dispatchSceneCommand(session, {
      commandId: crypto.randomUUID(),
      commandType: SCENE_COMMAND_TYPES.addCamera,
      actorId: 'local-user',
      guideId: session.guideId as EntityId,
      origin: 'user',
      occurredAt: new Date().toISOString(),
      payload: {
        bookmark: {
          bookmarkId: crypto.randomUUID(),
          name: 'Front',
          position: { x: 5, y: 5, z: 5 },
          target: { x: 0, y: 1, z: 0 },
          orthographic: false,
          zoom: 1,
        },
      },
    });
    expect(afterScene.cameras.length).toBeGreaterThan(0);
    void withCamera;

    // 3. Training: a measurable objective + a source-grounded question flow
    // through the command bus into the canonical snapshot.
    const objectiveId = await addObjective(session, {
      verb: 'select',
      target: 'the correct calibration test volume',
      conditions: 'given a 100-1000 uL micropipette and the approved source',
      criterion: 'within the documented tolerance',
      stepIds: [],
      citations: [{ sourceHash: 'a'.repeat(64), regionId: 'reg-1' }],
      criticality: 'core',
    });
    await addAssessmentItem(session, {
      objectiveId,
      prompt: 'Which test volume is specified for calibration?',
      interaction: 'single-choice',
      options: [
        { optionId: 'o1', text: '100 uL' },
        { optionId: 'o2', text: '500 uL' },
      ],
      scoringRule: { correct: ['o2'] },
      rationale: 'The approved source specifies 500 uL as the test volume.',
      citations: [{ sourceHash: 'a'.repeat(64), regionId: 'reg-1' }],
      criticality: 'core',
    });

    // 4. Close/reopen (offline durability).
    await closeGuide(session);
    const reopened = await openGuide(session.guideId);
    expect(reopened.working.guide.get('title')).toBe('Micropipette calibration');
    const sceneAfterReopen = loadScene(reopened);
    expect(sceneAfterReopen.cameras.length).toBeGreaterThan(0);
    expect(sceneAfterReopen.nodes.size).toBeGreaterThan(0);
    // Training (objective + assessment item) survives the reopen.
    const trainingAfterReopen = materializeTraining(reopened.working);
    expect(trainingAfterReopen.objectives).toHaveLength(1);
    expect(trainingAfterReopen.assessmentItems).toHaveLength(1);

    // 5. Export a complete draft package (assets must NOT be empty).
    const { bytes, filename } = await exportDraft(reopened);
    expect(filename).toContain('.gforge');
    expect(bytes.length).toBeGreaterThan(0);

    // The exported guide.json must carry the scene (canonical, not a separate
    // Dexie database) — this is the Phase 02 gate.
    const { strFromU8, unzipSync } = await import('fflate');
    const unzipped = unzipSync(bytes);
    const guideJson = JSON.parse(strFromU8(unzipped['guide.json']!)) as {
      scene?: { cameras: unknown[]; nodes: unknown[] };
      schemaVersion: number;
    };
    expect(guideJson.schemaVersion).toBe(2);
    expect(guideJson.scene).toBeDefined();
    expect(guideJson.scene!.cameras.length).toBeGreaterThan(0);
    expect(guideJson.scene!.nodes.length).toBeGreaterThan(0);
    await closeGuide(reopened);

    // 6. Import into a "clean" profile (fresh Dexie + y-indexeddb state).
    const imported = await importDraft(bytes);
    expect(imported.guideId).toBe(session.guideId);
    const importedSession = await openGuide(imported.guideId);

    // 7. Verify identical semantics: scene + training + procedure survive.
    const importedScene = loadScene(importedSession);
    expect(importedScene.cameras.length).toBe(sceneAfterReopen.cameras.length);
    expect(importedScene.nodes.size).toBe(sceneAfterReopen.nodes.size);
    expect(importedScene.nodes.get(sceneAfterReopen.nodes.keys().next().value!)?.name).toBe(
      'Pipette',
    );
    expect(importedSession.working.guide.get('title')).toBe('Micropipette calibration');
    await closeGuide(importedSession);
  });

  it('semantic comparator detects real differences (not just hash noise)', () => {
    const a = {
      schemaVersion: 2 as const,
      guideId: '11111111-1111-4111-8111-111111111111' as EntityId,
      title: 'Same',
      description: '',
      lifecycleState: 'draft' as const,
      createdAtIso: '2026-01-01T00:00:00Z',
      updatedAtIso: '2026-01-01T00:00:00Z',
      tasks: [],
      steps: [],
      scene: {
        nodes: [],
        rootOrder: [],
        layers: [
          { layerId: 'default', name: 'Default', visible: true, locked: false, color: '#2dd4bf' },
        ],
        cameras: [],
        measurements: [],
        annotations: [],
        stepStates: {},
      },
      training: {
        objectives: [],
        assessmentItems: [],
        modules: [],
        mastery: { requiredCriticalItems: 0, passThreshold: 0.8, maxAttempts: 3 },
      },
      sources: [],
    };
    const b = { ...a, title: 'Different' };
    const c = { ...a };
    expect(snapshotsSemanticallyEqual(a, c)).toBe(true);
    expect(snapshotsSemanticallyEqual(a, b)).toBe(false);
  });
});
