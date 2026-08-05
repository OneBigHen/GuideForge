import type { ContentHash } from '@guideforge/domain';
import fc from 'fast-check';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeConfidence,
  estimateTokens,
  evaluateIntake,
  isExtractionOutput,
  stableRegionId,
  structuralChunking,
  validateCitations,
  type SourceRegion,
} from './index.js';

const HASH = 'a'.repeat(64) as ContentHash;
const excerptHash = (t: string) => createHash('sha256').update(t).digest('hex');

describe('intake policy', () => {
  const policy = { maxSizeBytes: 1000, maxPages: 10, allowedTypes: ['application/pdf'] };

  it('accepts a valid PDF', () => {
    expect(
      evaluateIntake(policy, {
        detectedType: 'application/pdf',
        sizeBytes: 500,
        pageCount: 3,
        encrypted: false,
        malwareStatus: 'clean',
      }).accepted,
    ).toBe(true);
  });

  it('rejects encrypted, malware, oversized, unsupported, and overlong', () => {
    expect(
      evaluateIntake(policy, {
        detectedType: 'application/pdf',
        sizeBytes: 5,
        pageCount: 1,
        encrypted: true,
        malwareStatus: 'clean',
      }).reason,
    ).toBe('encrypted');
    expect(
      evaluateIntake(policy, {
        detectedType: 'application/pdf',
        sizeBytes: 5,
        pageCount: 1,
        encrypted: false,
        malwareStatus: 'blocked',
      }).reason,
    ).toBe('malware');
    expect(
      evaluateIntake(policy, {
        detectedType: 'text/plain',
        sizeBytes: 5,
        pageCount: 1,
        encrypted: false,
        malwareStatus: 'clean',
      }).reason,
    ).toContain('unsupported');
    expect(
      evaluateIntake(policy, {
        detectedType: 'application/pdf',
        sizeBytes: 5000,
        pageCount: 1,
        encrypted: false,
        malwareStatus: 'clean',
      }).reason,
    ).toBe('too large');
    expect(
      evaluateIntake(policy, {
        detectedType: 'application/pdf',
        sizeBytes: 5,
        pageCount: 50,
        encrypted: false,
        malwareStatus: 'clean',
      }).reason,
    ).toBe('too many pages');
  });
});

describe('stable region ids', () => {
  it('is deterministic for identical inputs', () => {
    expect(stableRegionId(HASH, 2, 'heading:1/paragraph:3')).toBe(
      stableRegionId(HASH, 2, 'heading:1/paragraph:3'),
    );
  });

  it('differs when inputs differ', () => {
    expect(stableRegionId(HASH, 2, 'heading:1')).not.toBe(stableRegionId(HASH, 3, 'heading:1'));
    expect(stableRegionId(HASH, 2, 'heading:1')).not.toBe(
      stableRegionId('b'.repeat(64) as ContentHash, 2, 'heading:1'),
    );
  });

  it('property: stable under repetition', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.string(), (page, path) => {
        expect(stableRegionId(HASH, page, path)).toBe(stableRegionId(HASH, page, path));
      }),
    );
  });
});

describe('structural chunking', () => {
  it('chunks by structure with token estimates', () => {
    const chunks = structuralChunking(HASH, 1, [
      { kind: 'heading', text: 'Procedure', structuralPath: 'heading:1' },
      { kind: 'warning', text: 'Disconnect power first', structuralPath: 'heading:1/warning:1' },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.region.kind).toBe('heading');
    expect(chunks[1]!.region.excerpt).toBe('Disconnect power first');
    expect(chunks[0]!.tokenEstimate).toBe(estimateTokens('Procedure'));
  });
});

describe('citation gate', () => {
  it('rejects claims with no citations', () => {
    const res = validateCitations({ citations: [] }, new Map(), excerptHash);
    expect(res.valid).toBe(false);
    expect(res.issues).toContain('claim has no citations');
  });

  it('rejects claims citing unknown regions', () => {
    const res = validateCitations(
      { citations: [{ regionId: 'reg-xxx', pageIndex: 0, excerptHash: 'h', claimRef: 'c' }] },
      new Map(),
      excerptHash,
    );
    expect(res.valid).toBe(false);
    expect(res.issues).toContain('region not found: reg-xxx');
  });

  it('rejects excerpt hash mismatch', () => {
    const region: SourceRegion = {
      regionId: 'reg-1',
      sourceHash: HASH,
      pageIndex: 0,
      structuralPath: 'p:1',
      excerpt: 'hello',
      kind: 'paragraph',
    };
    const res = validateCitations(
      { citations: [{ regionId: 'reg-1', pageIndex: 0, excerptHash: 'wrong', claimRef: 'c' }] },
      new Map([['reg-1', region]]),
      excerptHash,
    );
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.includes('excerpt hash mismatch'))).toBe(true);
  });

  it('accepts a fully-valid citation', () => {
    const region: SourceRegion = {
      regionId: 'reg-1',
      sourceHash: HASH,
      pageIndex: 0,
      structuralPath: 'p:1',
      excerpt: 'hello',
      kind: 'paragraph',
    };
    const res = validateCitations(
      {
        citations: [
          { regionId: 'reg-1', pageIndex: 0, excerptHash: excerptHash('hello'), claimRef: 'c' },
        ],
      },
      new Map([['reg-1', region]]),
      excerptHash,
    );
    expect(res.valid).toBe(true);
  });
});

describe('confidence', () => {
  it('combines weighted factors within [0,1]', () => {
    const c = computeConfidence({
      extractionQuality: 0.9,
      citationCoverage: 0.8,
      deterministicValidation: 1,
      sourceAmbiguity: 0.5,
    });
    expect(c.overall).toBeGreaterThan(0);
    expect(c.overall).toBeLessThanOrEqual(1);
  });
});

describe('extraction output schema', () => {
  it('validates a conforming extraction', () => {
    expect(
      isExtractionOutput({
        schemaVersion: 1,
        guideId: 'g1',
        tasks: [{ taskId: 't1', title: 'T', steps: [] }],
      }),
    ).toBe(true);
  });

  it('rejects non-conforming outputs', () => {
    expect(isExtractionOutput({ schemaVersion: 2, guideId: 'g', tasks: [] })).toBe(false);
    expect(isExtractionOutput(null)).toBe(false);
    expect(isExtractionOutput({ schemaVersion: 1, guideId: 'g', tasks: 'nope' })).toBe(false);
  });
});
