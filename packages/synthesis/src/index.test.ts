import { isExtractionOutput } from '@guideforge/ai-contracts';
import type { ContentHash } from '@guideforge/domain';
import { describe, expect, it } from 'vitest';
import {
  computeSourceCoverage,
  detectAmbiguities,
  extractClaims,
  planProcedureStructure,
  repairSynthesisPlan,
  synthesizeProcedure,
  validateSynthesisPlan,
  valueGrounded,
  type SynthesisRegion,
  type SynthesisSource,
} from './index.js';

const HASH_A = 'a'.repeat(64) as ContentHash;
const HASH_B = 'b'.repeat(64) as ContentHash;

function region(
  id: string,
  hash: ContentHash,
  excerpt: string,
  kind: SynthesisRegion['kind'] = 'paragraph',
  pageIndex = 0,
  structuralPath = `p:${id}`,
): SynthesisRegion {
  return {
    regionId: id,
    sourceHash: hash,
    pageIndex,
    structuralPath,
    excerpt,
    kind,
  };
}

function source(
  hash: ContentHash,
  regions: SynthesisRegion[],
  filename = 'src.txt',
): SynthesisSource {
  return {
    sourceHash: hash,
    originalFilename: filename,
    detectedType: 'text/plain',
    sizeBytes: 1024,
    regions,
  };
}

describe('synthesis: structure planning', () => {
  it('heading regions become tasks; paragraphs become steps', () => {
    const { tasks, regionsByTask } = planProcedureStructure([
      source(HASH_A, [
        region('r1', HASH_A, 'Part 1', 'heading'),
        region('r2', HASH_A, 'Do the careful thing.'),
        region('r3', HASH_A, 'Part 2', 'heading'),
        region('r4', HASH_A, 'Verify it works.'),
      ]),
    ]);
    expect(tasks.map((t) => t.title)).toEqual(['Part 1', 'Part 2']);
    expect(tasks.every((t) => t.taskId.startsWith(`task-${HASH_A.slice(0, 8)}-`))).toBe(true);
    expect(regionsByTask.get(tasks[0]!.taskId)!.map((r) => r.regionId)).toEqual(['r2']);
    expect(regionsByTask.get(tasks[1]!.taskId)!.map((r) => r.regionId)).toEqual(['r4']);
  });

  it('creates a default task when no headings exist', () => {
    const { tasks, regionsByTask } = planProcedureStructure([
      source(HASH_A, [region('r1', HASH_A, 'Do the thing.')]),
    ]);
    expect(tasks.length).toBe(1);
    expect(regionsByTask.get(tasks[0]!.taskId)!.length).toBe(1);
  });
});

describe('synthesis: claim extraction', () => {
  it('grounds values only when they appear in the region', () => {
    const step = extractClaims(
      region('r1', HASH_A, 'Set torque to 5 nm with a wrench. Check the seal fits.'),
      'task-1',
    );
    expect(step.citations).toEqual(['r1']);
    expect(step.values.some((v) => v.label === '5 nm')).toBe(true);
    expect(step.tools.length).toBeGreaterThan(0);
    expect(step.verificationSteps.length).toBeGreaterThan(0);
  });

  it('never invents values not present in the source text', () => {
    const step = extractClaims(region('r1', HASH_A, 'Tighten the bolt by hand.'), 'task-1');
    // 'nm' is not in the excerpt, so no values may be invented.
    expect(step.values.length).toBe(0);
  });
});

describe('synthesis: strict validation', () => {
  it('rejects invented values and uncited steps', () => {
    const r1 = region('r1', HASH_A, 'Set pressure to 40 psi.');
    const regions = new Map([['r1', r1]]);
    const step = extractClaims(r1, 'task-1');
    // Inject an invented value that is not grounded in r1.
    const tampered = {
      ...step,
      values: [...step.values, { label: '999 nm', value: '999', unit: 'nm' }],
    };
    const plan = {
      schemaVersion: 1 as const,
      guideId: 'g',
      tasks: [{ taskId: 'task-1', title: 'T', steps: [tampered] }],
    };
    const { issues, ok } = validateSynthesisPlan(plan, regions, new Set([HASH_A]));
    expect(ok).toBe(false);
    expect(issues.some((i) => i.code === 'invented-value')).toBe(true);
  });

  it('rejects steps citing unknown regions', () => {
    const plan = {
      schemaVersion: 1 as const,
      guideId: 'g',
      tasks: [
        {
          taskId: 'task-1',
          title: 'T',
          steps: [
            {
              stepId: 's1',
              taskId: 'task-1',
              action: 'Do it',
              warnings: [],
              prerequisites: [],
              tools: [],
              parts: [],
              values: [],
              conditions: [],
              verificationSteps: [],
              citations: ['missing-region'],
            },
          ],
        },
      ],
    };
    const { issues, ok } = validateSynthesisPlan(plan, new Map(), new Set([HASH_A]));
    expect(ok).toBe(false);
    expect(issues.some((i) => i.code === 'unknown-region')).toBe(true);
  });
});

describe('synthesis: coverage and ambiguity', () => {
  it('computes coverage from cited regions', () => {
    const regions = [region('r1', HASH_A, 'One.'), region('r2', HASH_A, 'Two.')];
    const plan = {
      schemaVersion: 1 as const,
      guideId: 'g',
      tasks: [
        {
          taskId: 'task-1',
          title: 'T',
          steps: [extractClaims(regions[0]!, 'task-1')],
        },
      ],
    };
    const coverage = computeSourceCoverage(regions, plan);
    expect(coverage.coverageRatio).toBe(0.5);
    expect(coverage.uncitedRegions).toEqual(['r2']);
  });

  it('surfaces near-duplicate and empty regions', () => {
    const a = source(HASH_A, [
      region('r1', HASH_A, 'Repeat the same sentence over and over again.'),
    ]);
    const b = source(HASH_B, [
      region('r2', HASH_B, 'Repeat the same sentence over and over again.'),
    ]);
    const empty = source(HASH_A, [region('r3', HASH_A, '   ')]);
    const amb = detectAmbiguities([a, b, empty]);
    expect(amb.some((x) => x.reason === 'no-text')).toBe(true);
    expect(amb.some((x) => x.reason === 'near-duplicate')).toBe(true);
  });
});

describe('synthesis: bounded repair', () => {
  it('drops uncited/unknown-region steps and reports them', () => {
    const r1 = region('r1', HASH_A, 'Valid step. Use 5 nm.');
    const regions = new Map([['r1', r1]]);
    const good = extractClaims(r1, 'task-1');
    const bad = {
      stepId: 's-bad',
      taskId: 'task-1',
      action: 'No citation',
      warnings: [],
      prerequisites: [],
      tools: [],
      parts: [],
      values: [],
      conditions: [],
      verificationSteps: [],
      citations: [] as string[],
    };
    const plan = {
      schemaVersion: 1 as const,
      guideId: 'g',
      tasks: [{ taskId: 'task-1', title: 'T', steps: [good, bad] }],
    };
    const { output, repair } = repairSynthesisPlan(plan, regions);
    expect(output.tasks[0]!.steps.map((s) => s.stepId)).toEqual(['step-r1']);
    expect(repair.droppedActionable).toBe(true);
    expect(repair.repairs.length).toBeGreaterThan(0);
  });

  it('bounded: never exceeds MAX_REPAIRS repairs in one run', () => {
    const plan = {
      schemaVersion: 1 as const,
      guideId: 'g',
      tasks: [
        {
          taskId: 'task-1',
          title: 'T',
          steps: [1, 2, 3, 4, 5].map((n) => ({
            stepId: `s${n}`,
            taskId: 'task-1',
            action: 'x',
            warnings: [] as string[],
            prerequisites: [] as string[],
            tools: [] as string[],
            parts: [] as string[],
            values: [] as { label: string; value: string; unit?: string }[],
            conditions: [] as string[],
            verificationSteps: [] as string[],
            citations: [] as string[],
          })),
        },
      ],
    };
    const { repair } = repairSynthesisPlan(plan, new Map());
    expect(repair.repairs.length).toBeLessThanOrEqual(3);
  });
});

describe('synthesis: end-to-end', () => {
  it('produces a strict extraction output with valid citations and full coverage', () => {
    const request = {
      guideId: '123e4567-e89b-42d3-a456-426614174000',
      sources: [
        source(
          HASH_A,
          [
            region('r1', HASH_A, 'Equipment Setup', 'heading'),
            region('r2', HASH_A, 'Use a wrench to tighten to 5 nm.'),
            region('r3', HASH_A, 'Check the seal fits; verify pressure is 40 psi.'),
            region('r4', HASH_A, 'Safety: never exceed 60 rpm while the cover is off.', 'warning'),
          ],
          'setup.txt',
        ),
      ],
    };
    const plan = synthesizeProcedure(request);
    expect(isExtractionOutput(plan.output)).toBe(true);
    expect(plan.output.tasks.length).toBe(1);
    expect(plan.output.tasks[0]!.steps.length).toBe(3);
    // Every actionable step must have at least one citation.
    for (const task of plan.output.tasks) {
      for (const step of task.steps) {
        expect(step.citations.length).toBeGreaterThan(0);
      }
    }
    // Strict validation must pass after repair.
    const { ok } = validateSynthesisPlan(
      plan.output,
      new Map(request.sources.flatMap((s) => s.regions.map((r) => [r.regionId, r] as const))),
      new Set(request.sources.map((s) => s.sourceHash)),
    );
    expect(ok).toBe(true);
    expect(plan.coverage.coverageRatio).toBe(1);
    expect(plan.repair.repairs.length).toBe(0);
  });

  it('invented values are rejected before they become proposals', () => {
    const request = {
      guideId: 'g',
      sources: [source(HASH_A, [region('r1', HASH_A, 'Tighten by hand.')])],
    };
    const plan = synthesizeProcedure(request);
    for (const task of plan.output.tasks) {
      for (const step of task.steps) {
        for (const v of step.values) {
          // The value must be grounded in the cited region.
          const cited = request.sources
            .flatMap((s) => s.regions)
            .find((r) => r.regionId === step.citations[0]);
          expect(cited).toBeTruthy();
          expect(valueGrounded(v.label, cited!)).toBe(true);
        }
      }
    }
  });
});
