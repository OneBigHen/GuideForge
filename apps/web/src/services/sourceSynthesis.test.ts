import type { ContentHash } from '@guideforge/domain';
import { openDb, OpfsAssetStore } from '@guideforge/storage-web';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addSource, type SourceStudio } from './sourceStudio';
import { planToProposals, synthesizeFromSources, type RegionRef } from './sourceSynthesis';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const HASH_A = 'a'.repeat(64) as ContentHash;

function studio(): SourceStudio {
  const db = openDb();
  return { db, assets: new OpfsAssetStore(db) };
}

function uniqueGuide(): string {
  return `guide-${crypto.randomUUID()}`;
}

async function seedTextSource(
  s: SourceStudio,
  guideId: string,
  filename: string,
  markdown: string,
): Promise<void> {
  await addSource(s, {
    guideId,
    originalFilename: filename,
    bytes: new TextEncoder().encode(markdown),
    token: { cancelled: false, reason: null },
  });
}

describe('source synthesis (Phase 06)', () => {
  it('creates pending proposals for a sourced procedure with citations', async () => {
    const s = studio();
    const guideId = uniqueGuide();
    await seedTextSource(
      s,
      guideId,
      'setup.md',
      [
        '# Equipment Setup',
        'Use a wrench to tighten to 5 nm.',
        'Check the seal fits; verify pressure is 40 psi.',
        'Safety: never exceed 60 rpm while the cover is off.',
      ].join('\n'),
    );

    const result = await synthesizeFromSources({ guideId }, s);
    expect(result.proposalsCreated).toBeGreaterThan(0);
    expect(result.coverageRatio).toBe(1);
    expect(result.taskCount).toBe(1);
    expect(result.stepCount).toBe(3);
    expect(result.ok).toBe(true);
    expect(result.ambiguities).toBe(0);
  });

  it('every generated proposal carries a citation and a provider receipt', async () => {
    const s = studio();
    const guideId = uniqueGuide();
    await seedTextSource(s, guideId, 'proc.md', 'Use a wrench to tighten to 5 nm.');

    const result = await synthesizeFromSources({ guideId }, s);
    expect(result.proposalsCreated).toBeGreaterThan(0);

    const rows = await s.db.proposals.where('guideId').equals(guideId).toArray();
    for (const p of rows) {
      expect(p.status).toBe('pending');
      expect(p.receipt.provider).toBe('synthesis-local');
      expect(p.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    }
    // Steps, tools, values, and verifications must cite the region.
    const withCitations = rows.filter((p) => p.citations.length > 0);
    expect(withCitations.length).toBeGreaterThan(0);
    for (const p of withCitations) {
      expect(p.citations[0]!.regionId.length).toBeGreaterThan(0);
    }
  });

  it('never invents values: ungrounded values are repaired out', async () => {
    const s = studio();
    const guideId = uniqueGuide();
    // "999 nm" does not appear in the source, so no value proposal may claim it.
    await seedTextSource(s, guideId, 'plain.md', 'Tighten the bolt by hand.');

    const result = await synthesizeFromSources({ guideId }, s);
    expect(result.ok).toBe(true);

    const rows = await s.db.proposals.where('guideId').equals(guideId).toArray();
    for (const p of rows) {
      expect(p.commandType).not.toBe('guide/add-value');
    }
  });

  it('planToProposals maps a plan into typed proposals without mutations', () => {
    const plan = {
      output: {
        schemaVersion: 1 as const,
        guideId: 'g',
        tasks: [
          {
            taskId: 'task-1',
            title: 'Setup',
            steps: [
              {
                stepId: 'step-1',
                taskId: 'task-1',
                action: 'Tighten to 5 nm with a wrench.',
                warnings: ['Never exceed 60 rpm.'],
                prerequisites: [],
                tools: ['wrench'],
                parts: [],
                values: [{ label: '5 nm', value: '5', unit: 'nm' }],
                conditions: ['if the cover is off'],
                verificationSteps: ['check the seal fits'],
                citations: ['reg-1'],
              },
            ],
          },
        ],
      },
      confidence: { overall: 0.8 } as unknown as Parameters<
        typeof planToProposals
      >[1]['confidence'],
      coverage: {
        totalRegions: 1,
        citedRegions: 1,
        coverageRatio: 1,
        uncitedRegions: [],
      },
      ambiguities: [],
      issues: [],
      repair: { repairs: [], droppedActionable: false },
    } as Parameters<typeof planToProposals>[1];

    const refs = new Map<string, RegionRef>([
      ['reg-1', { regionId: 'reg-1', pageIndex: 0, sourceHash: HASH_A, excerptHash: 'h' }],
    ]);
    const proposals = planToProposals('g', plan, refs);

    const types = proposals.map((p) => p.commandType);
    expect(types).toContain('guide/add-task');
    expect(types).toContain('guide/add-step');
    expect(types).toContain('guide/add-warning');
    expect(types).toContain('guide/add-tool');
    expect(types).toContain('guide/add-value');
    expect(types).toContain('guide/add-condition');
    expect(types).toContain('guide/add-verification');
    // The value proposal must be grounded in the cited region.
    const valueProposal = proposals.find((p) => p.commandType === 'guide/add-value')!;
    expect(valueProposal.citations?.[0]!.regionId).toBe('reg-1');
  });
});
