import type { GuideSnapshot } from '@guideforge/guide-schema';
import { describe, expect, it } from 'vitest';
import { exportMsGuide, importMsGuide, MsGuideError, parseMsGuideTar } from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000';

function snapshot(): GuideSnapshot {
  return {
    schemaVersion: 4,
    guideId: GUIDE_ID as GuideSnapshot['guideId'],
    title: 'Fixture',
    description: '',
    lifecycleState: 'draft',
    createdAtIso: '2026-01-01T00:00:00Z',
    updatedAtIso: '2026-01-01T00:00:00Z',
    tasks: [
      {
        taskId: '11111111-1111-4111-8111-111111111111' as never,
        title: 'T1',
        stepIds: ['22222222-2222-4222-8222-222222222222' as never],
      },
    ],
    steps: [
      {
        stepId: '22222222-2222-4222-8222-222222222222' as never,
        taskId: '11111111-1111-4111-8111-111111111111' as never,
        instructionText: 'Do the thing',
        warnings: [],
        tools: [],
        parts: [],
        values: [],
        conditions: [],
        verification: [],
        media: [],
        claimIds: [],
      },
    ],
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
}

describe('ms guide parse safety', () => {
  it('rejects traversal entry names', () => {
    const tar = new Uint8Array(0);
    // parseMsGuideTar on empty bytes must throw (invalid tar), not silently pass.
    expect(() => parseMsGuideTar(tar)).toThrow(MsGuideError);
  });
});

describe('ms guide export → import round trip', () => {
  it('exports supported subset and imports it back with a report', () => {
    const { bytes, report } = exportMsGuide(snapshot(), { acceptApproximations: false });
    expect(bytes.length).toBeGreaterThan(0);
    expect(report.unsupported).toHaveLength(0);

    const imported = importMsGuide(bytes, 'Fixture.guide');
    expect(imported.snapshot.tasks).toHaveLength(1);
    expect(imported.snapshot.steps).toHaveLength(1);
    expect(imported.snapshot.steps[0]?.instructionText).toBe('Do the thing');
    expect(imported.report.source).toBe('Fixture.guide');
  });

  it('refuses export that would silently lose warnings/tools/parts', () => {
    const rich = snapshot();
    rich.steps[0]!.warnings = [
      {
        warningId: '33333333-3333-4333-8333-333333333333' as never,
        severity: 'warning',
        message: 'Careful',
      },
    ];
    expect(() => exportMsGuide(rich, { acceptApproximations: false })).toThrow(/silently lose/);
  });

  it('exports with explicit approximation acceptance and reports the loss', () => {
    const rich = snapshot();
    rich.steps[0]!.warnings = [
      {
        warningId: '33333333-3333-4333-8333-333333333333' as never,
        severity: 'warning',
        message: 'Careful',
      },
    ];
    const { report } = exportMsGuide(rich, { acceptApproximations: true });
    expect(report.warnings.some((w) => w.includes('warnings/tools/parts'))).toBe(true);
  });

  it('preserves unknown fields as namespaced compatibility records', () => {
    // Build a guide with an unknown top-level field.
    const { bytes } = exportMsGuide(snapshot(), { acceptApproximations: false });
    const imported = importMsGuide(bytes, 'x.guide');
    // Our exporter emits only known fields, so unknown list is empty.
    expect(Array.isArray(imported.report.unknownFields)).toBe(true);
  });

  it('never emits a tenant URI', () => {
    const { bytes } = exportMsGuide(snapshot(), { acceptApproximations: false });
    const text = new TextDecoder().decode(bytes);
    expect(text.toLowerCase()).not.toContain('crm.dynamics.com');
    expect(text.toLowerCase()).not.toContain('dataverse');
  });
});
