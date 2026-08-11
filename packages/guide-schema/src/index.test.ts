import { describe, expect, it } from 'vitest';
import {
  GUIDE_SCHEMA_VERSION,
  generateTrainingFromProcedure,
  isGuideSnapshot,
  migrateLegacySourceRecord,
  validateTrainingProgram,
  type GuideSnapshot,
  type LegacySourceRecord,
} from './index.js';
import { migrateToCurrent, migrationChainComplete } from './migrations.js';

describe('guide-schema', () => {
  it('exposes the schema version', () => {
    expect(GUIDE_SCHEMA_VERSION).toBe(4);
  });

  it('validates a minimal v4 snapshot', () => {
    const snapshot = {
      schemaVersion: 4,
      guideId: '123e4567-e89b-42d3-a456-426614174000',
      title: 'Test',
      description: '',
      lifecycleState: 'draft',
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
        anchors: [],
        stepStates: {},
      },
      training: {
        objectives: [],
        assessmentItems: [],
        modules: [],
        lessons: [],
        mastery: { requiredCriticalItems: 0, passThreshold: 0.8, maxAttempts: 3 },
      },
      sources: [],
      claims: [],
      citations: [],
      generationRuns: [],
    };
    expect(isGuideSnapshot(snapshot)).toBe(true);
  });

  it('rejects non-snapshots and v1-shaped objects', () => {
    expect(isGuideSnapshot(null)).toBe(false);
    expect(isGuideSnapshot({ schemaVersion: 99 })).toBe(false);
    // A v1 snapshot (no scene/training/sources) is no longer valid directly;
    // it must be migrated.
    expect(
      isGuideSnapshot({
        schemaVersion: 1,
        guideId: '123e4567-e89b-42d3-a456-426614174000',
        title: 'T',
        description: '',
        lifecycleState: 'draft',
        createdAtIso: '2026-01-01T00:00:00Z',
        updatedAtIso: '2026-01-01T00:00:00Z',
        tasks: [] as unknown[],
        steps: [] as unknown[],
      }),
    ).toBe(false);
  });

  it('migrates v1 input to current version with empty structures', () => {
    const v1 = {
      schemaVersion: 1,
      guideId: '123e4567-e89b-42d3-a456-426614174000',
      title: 'T',
      description: '',
      lifecycleState: 'draft',
      createdAtIso: '2026-01-01T00:00:00Z',
      updatedAtIso: '2026-01-01T00:00:00Z',
      tasks: [],
      steps: [],
    };
    const out = migrateToCurrent(v1);
    expect(out.schemaVersion).toBe(4);
    expect(out.title).toBe('T');
    expect(out.scene.nodes).toEqual([]);
    expect(out.scene.layers).toHaveLength(1);
    expect(out.training.objectives).toEqual([]);
    expect(out.sources).toEqual([]);
    // Migrated output must itself validate as a current snapshot.
    expect(isGuideSnapshot(out)).toBe(true);
  });

  it('migrates v2 steps to v3 with empty values/conditions/verification', () => {
    const v2 = {
      schemaVersion: 2,
      guideId: '123e4567-e89b-42d3-a456-426614174000',
      title: 'T',
      description: '',
      lifecycleState: 'draft',
      createdAtIso: '2026-01-01T00:00:00Z',
      updatedAtIso: '2026-01-01T00:00:00Z',
      tasks: [],
      steps: [
        {
          stepId: '123e4567-e89b-42d3-a456-426614174001',
          taskId: '123e4567-e89b-42d3-a456-426614174002',
          instructionText: 'Tighten the bolt.',
          warnings: [],
          tools: [],
          parts: [],
          media: [],
        },
      ],
      scene: {
        nodes: [],
        rootOrder: [],
        layers: [],
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
    const out = migrateToCurrent(v2);
    expect(out.schemaVersion).toBe(4);
    expect(out.steps[0]!.values).toEqual([]);
    expect(out.steps[0]!.conditions).toEqual([]);
    expect(out.steps[0]!.verification).toEqual([]);
    expect(isGuideSnapshot(out)).toBe(true);
  });

  it('rejects unknown schema versions', () => {
    expect(() => migrateToCurrent({ schemaVersion: 99, title: 'x' })).toThrow(
      /no migration from schema version 99/,
    );
  });

  it('migration chain is contiguous', () => {
    expect(migrationChainComplete()).toBe(true);
  });

  it('migrates a legacy Dexie source record into canonical hashed regions', () => {
    const legacy: LegacySourceRecord = {
      sourceId: '123e4567-e89b-42d3-a456-426614174003',
      guideId: '123e4567-e89b-42d3-a456-426614174000',
      originalFilename: 'calibration.pdf',
      detectedType: 'application/pdf',
      kind: 'pdf',
      sha256: 'a'.repeat(64),
      sizeBytes: 42,
      pageCount: 2,
      receivedAtIso: '2026-01-01T00:00:00.000Z',
      ocrRoute: 'text-layer',
      status: 'complete',
      receipt: null,
      regions: [
        {
          regionId: 'region-1',
          pageIndex: 1,
          kind: 'paragraph',
          excerpt: 'Set the balance to zero.',
          structuralPath: 'page:2/block:1',
        },
      ],
      conflicts: [],
      tables: [],
      mediaSegments: [],
    };

    const source = migrateLegacySourceRecord(legacy);
    expect(source.sourceId).toBe(legacy.sourceId);
    expect(source.kind).toBe('pdf');
    expect(source.status).toBe('ready');
    expect(source.regions[0]).toMatchObject({
      regionId: 'region-1',
      sourceHash: legacy.sha256,
      locator: { kind: 'page', pageIndex: 1 },
      type: 'paragraph',
    });
    expect(source.regions[0]!.contentHash).toHaveLength(64);
  });

  it('generates a complete source-grounded training graph from procedure steps', () => {
    const sourceHash = 'a'.repeat(64);
    const snapshot = {
      guideId: 'guide-1',
      title: 'Pump setup',
      tasks: [{ taskId: 'task-1', title: 'Setup', stepIds: ['step-1'] }],
      steps: [
        {
          stepId: 'step-1',
          taskId: 'task-1',
          instructionText: 'Disconnect power before opening the housing.',
          warnings: [],
          claimIds: [],
        },
      ],
      sources: [
        {
          sourceHash,
          regions: [
            {
              regionId: 'region-1',
              sourceHash,
              text: 'Disconnect power before opening the housing.',
            },
          ],
        },
      ],
      citations: [],
    } as unknown as GuideSnapshot;

    const result = generateTrainingFromProcedure(snapshot);
    expect(result.quality.ok).toBe(true);
    expect(result.training.competencies).toHaveLength(1);
    expect(result.training.activities?.length).toBeGreaterThan(0);
    expect(result.training.assessmentBlueprint?.itemIds).toHaveLength(1);
    expect(result.training.assessmentItems[0]?.feedback?.incorrect).toBeTruthy();
    expect(result.training.remediationEdges).toHaveLength(1);
    expect(result.quality.coverage.sourceGroundedItems).toBe(1);
  });

  it('fails the quality gate when an item loses its source citation', () => {
    const sourceHash = 'b'.repeat(64);
    const snapshot = {
      guideId: 'guide-2',
      title: 'Filter change',
      tasks: [{ taskId: 'task-2', title: 'Change filter', stepIds: ['step-2'] }],
      steps: [
        {
          stepId: 'step-2',
          taskId: 'task-2',
          instructionText: 'Close the isolation valve.',
          warnings: [],
          claimIds: [],
        },
      ],
      sources: [
        {
          sourceHash,
          regions: [{ regionId: 'region-2', sourceHash, text: 'Close the isolation valve.' }],
        },
      ],
      citations: [],
    } as unknown as GuideSnapshot;
    const generated = generateTrainingFromProcedure(snapshot);
    const tampered = {
      ...generated.training,
      assessmentItems: generated.training.assessmentItems.map((item) => ({
        ...item,
        citations: [],
      })),
    };
    const report = validateTrainingProgram(tampered, snapshot);
    expect(report.ok).toBe(false);
    expect(report.issues.some((item) => item.code === 'missing-citation')).toBe(true);
  });
});
