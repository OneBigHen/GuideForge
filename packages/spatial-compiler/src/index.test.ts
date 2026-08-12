import type { AssetMetadata } from '@guideforge/assets';
import { freshGuideState } from '@guideforge/commands';
import type { ContentHash, EntityId } from '@guideforge/domain';
import { applySceneCommands, createSceneState } from '@guideforge/scene-core';
import { describe, expect, it } from 'vitest';
import {
  compileSpatialGuide,
  extractEquipmentRequirements,
  stableId,
  type SpatialCompileInput,
} from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000' as EntityId;
const TASK_ID = '223e4567-e89b-42d3-a456-426614174000' as EntityId;
const STEP_ID = '323e4567-e89b-42d3-a456-426614174000' as EntityId;

function snapshot() {
  const result = freshGuideState(GUIDE_ID, 'Micropipette calibration');
  result.tasks = [{ taskId: TASK_ID, title: 'Calibrate', stepIds: [STEP_ID] }];
  result.steps = [
    {
      stepId: STEP_ID,
      taskId: TASK_ID,
      instructionText: 'Use the micropipette to transfer the calibration volume.',
      warnings: [],
      tools: [{ toolId: '423e4567-e89b-42d3-a456-426614174000' as EntityId, name: 'Micropipette' }],
      parts: [],
      values: [],
      conditions: [],
      verification: [],
      media: [],
      claimIds: [],
    },
  ];
  return result;
}

function asset(name: string, overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return {
    assetId: '523e4567-e89b-42d3-a456-426614174000' as EntityId,
    contentHash: 'a'.repeat(64) as ContentHash,
    derivativeHashes: [],
    name,
    aliases: ['micropipette'],
    tags: ['laboratory'],
    format: 'glb',
    mimeTypes: ['model/gltf-binary'],
    sizeBytes: 100,
    dimensionsMeters: { x: 0.03, y: 0.2, z: 0.03 },
    origin: { kind: 'provider', provider: 'test', licenseId: 'CC0' },
    reviewState: 'visually-reviewed',
    geometryHealth: null,
    semanticAliases: ['pipette'],
    semanticAnchors: [
      { anchorId: 'tip', label: 'Tip' },
      { anchorId: 'plunger', label: 'Plunger' },
    ],
    usedByProjectIds: [],
    createdAtIso: new Date(0).toISOString(),
    updatedAtIso: new Date(0).toISOString(),
    ...overrides,
  };
}

function compile(overrides: Partial<SpatialCompileInput> = {}) {
  return compileSpatialGuide({
    snapshot: snapshot(),
    assets: [asset('Reviewed micropipette')],
    seed: 'micropipette-golden',
    occurredAtIso: new Date(0).toISOString(),
    ...overrides,
  });
}

describe('spatial compiler', () => {
  it('extracts typed equipment, resolves a licensed local asset, and plans an editable scene', () => {
    const result = compile({
      requirements: [{ name: 'Beaker', role: 'equipment', stepIds: [STEP_ID] }],
    });

    expect(result.requirements.map((requirement) => requirement.role)).toContain('tool');
    expect(result.graph.relations.map((relation) => relation.kind)).toEqual(
      expect.arrayContaining(['supports', 'contains', 'uses', 'points-to']),
    );
    expect(result.constraints.some((constraint) => constraint.kind === 'clear-zone')).toBe(true);
    expect(
      result.resolvedAssets.find((asset) => asset.displayName === 'Reviewed micropipette')?.source,
    ).toBe('local');
    expect(result.scene.nodes).toHaveLength(3);
    expect(result.scene.cameras).toHaveLength(2);
    expect(result.scene.stepStates[STEP_ID]?.cameraId).toBe(result.cameras[1]?.cameraId);
    expect(result.scene.surfaceAttachments.length).toBeGreaterThanOrEqual(2);
    expect(result.scene.annotations.every((annotation) => annotation.attachmentId !== null)).toBe(
      true,
    );
    expect(result.commands.length).toBe(
      result.scene.nodes.length +
        result.scene.cameras.length +
        result.scene.surfaceAttachments.length +
        result.scene.annotations.length +
        Object.keys(result.scene.stepStates).length,
    );
    expect(result.validation.ok).toBe(true);
    expect(result.validation.errors).toEqual([]);
    expect(result.validation.warnings.some((warning) => warning.includes('procedural proxy'))).toBe(
      true,
    );

    const applied = applySceneCommands(createSceneState(), result.commands);
    expect(applied.nodes.size).toBe(result.scene.nodes.length);
    expect(applied.cameras).toHaveLength(result.scene.cameras.length);
    expect(applied.surfaceAttachments).toHaveLength(result.scene.surfaceAttachments.length);
    expect(applied.annotations).toHaveLength(result.scene.annotations.length);
    expect(applied.stepStates[STEP_ID]?.cameraId).toBe(result.cameras[1]?.cameraId);
  });

  it('is byte-for-byte deterministic for a stable seed and uses bounded critic calls', () => {
    let criticCalls = 0;
    const critic = () => {
      criticCalls += 1;
      return [{ severity: 'warning' as const, code: 'manual-review', message: 'Review framing.' }];
    };
    const first = compile({ visualCritic: critic });
    const second = compile({ visualCritic: critic });

    expect(first).toEqual(second);
    expect(criticCalls).toBe(2);
    expect(stableId('test', 'stable')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('fails closed when an unknown requirement has no renderable asset or proxy', () => {
    const requirements = extractEquipmentRequirements(snapshot(), [
      {
        name: 'Unknown calibration fixture',
        role: 'equipment',
        dimensionsMeters: { x: 0.2, y: 0.2, z: 0.2 },
      },
    ]);
    expect(
      requirements.some((requirement) => requirement.name === 'Unknown calibration fixture'),
    ).toBe(true);
    const result = compile({
      requirements: [{ name: 'Unknown calibration fixture', role: 'equipment' }],
      assets: [],
      allowProceduralProxies: false,
    });
    expect(result.resolvedAssets.some((asset) => asset.source === 'missing')).toBe(true);
    expect(result.validation.ok).toBe(false);
    expect(
      result.validation.errors.some((error) => error.includes('missing renderable asset')),
    ).toBe(true);
  });
});
