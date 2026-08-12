import type { ContentHash } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import fc from 'fast-check';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildDraftEntries,
  createDraftPackage,
  extractZipArchive,
  FIXED_TIMESTAMP,
  PackageSafetyError,
  preflightZipArchive,
  sanitizeExternalResource,
  sanitizePackageMetadata,
  validatePackagePath,
  verifyPackageStructure,
} from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000' as ContentHash & string;

function snapshot(title: string): GuideSnapshot {
  return {
    schemaVersion: 5,
    guideId: GUIDE_ID as unknown as GuideSnapshot['guideId'],
    title,
    description: '',
    lifecycleState: 'draft',
    createdAtIso: FIXED_TIMESTAMP,
    updatedAtIso: FIXED_TIMESTAMP,
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
      surfaceAttachments: [],
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

function assetBytes(hash: ContentHash, ext: string, bytes: Uint8Array) {
  return {
    hash,
    mimeType: 'application/octet-stream',
    extension: ext,
    sizeBytes: bytes.length,
    bytes,
  };
}

/** Compute the real SHA-256 of bytes and use it as the content hash. */
function realHash(bytes: Uint8Array): ContentHash {
  return createHash('sha256').update(bytes).digest('hex') as ContentHash;
}

describe('package-gforge path safety', () => {
  it('rejects absolute paths, traversal, and backslashes', () => {
    expect(() => validatePackagePath('/etc/passwd')).toThrow(PackageSafetyError);
    expect(() => validatePackagePath('../escape')).toThrow(PackageSafetyError);
    expect(() => validatePackagePath('a/../../b')).toThrow(PackageSafetyError);
    expect(() => validatePackagePath('a\\b')).toThrow(PackageSafetyError);
    expect(() => validatePackagePath('C:\\evil')).toThrow(PackageSafetyError);
    expect(() => validatePackagePath('a//b')).toThrow(PackageSafetyError);
    expect(() => validatePackagePath('')).toThrow(PackageSafetyError);
  });

  it('accepts safe normalized relative paths', () => {
    expect(validatePackagePath('guide.json')).toBe('guide.json');
    expect(validatePackagePath('assets/abc.glb')).toBe('assets/abc.glb');
  });

  it('property: rejects any path with traversal or absolute form', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        // The traversal invariant is SEGMENT-level: `..` as a whole segment
        // (including trailing-whitespace variants some filesystems normalize),
        // absolute prefixes, and backslashes. A filename like `a..b` contains
        // `..` as a substring but is NOT traversal and must be accepted.
        const segments = s.split('/');
        const hasParentSegment = segments.some((seg) => seg.trimEnd() === '..');
        const hasNonNormalizedSegment = segments.some(
          (seg) => seg.trimEnd() === '.' || seg.trimEnd() === '',
        );
        if (
          hasParentSegment ||
          hasNonNormalizedSegment ||
          s.startsWith('/') ||
          /^[A-Za-z]:/.test(s) ||
          s.includes('\\')
        ) {
          expect(() => validatePackagePath(s)).toThrow(PackageSafetyError);
        }
      }),
    );
  });

  it('accepts filenames that merely contain a dot-dot substring', () => {
    // Regression: `a..b` is a legal filename; only `..` as a whole segment is
    // traversal. The fuzzer surfaced this distinction.
    expect(() => validatePackagePath('v1..2.glb')).not.toThrow();
  });
});

describe('package-gforge determinism', () => {
  it('repeated export of the same inputs is byte-identical', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = realHash(bytes);
    const input = {
      snapshot: snapshot('Demo'),
      assets: new Map([[hash, assetBytes(hash, 'glb', bytes)]]),
    };
    const first = createDraftPackage(input);
    const second = createDraftPackage(input);
    expect(first).toEqual(second);
    expect(createHash('sha256').update(first).digest('hex')).toBe(
      createHash('sha256').update(second).digest('hex'),
    );
  });

  it('different content produces a different package hash', () => {
    const inputA = { snapshot: snapshot('A'), assets: new Map() };
    const inputB = { snapshot: snapshot('B'), assets: new Map() };
    const a = createDraftPackage(inputA);
    const b = createDraftPackage(inputB);
    expect(a).not.toEqual(b);
  });

  it('manifest records sorted entries with correct hashes', () => {
    const b1 = new Uint8Array([9, 9]);
    const b2 = new Uint8Array([1]);
    const h1 = realHash(b1);
    const h2 = realHash(b2);
    const entries = buildDraftEntries({
      snapshot: snapshot('S'),
      assets: new Map([
        [h1, assetBytes(h1, 'png', new Uint8Array([9, 9]))],
        [h2, assetBytes(h2, 'glb', new Uint8Array([1]))],
      ]),
    });
    const paths = entries.map((e) => e.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toContain('manifest.json');
    expect(paths).toContain('guide.json');
    expect(paths).toContain(`assets/${h1}.png`);
    expect(paths).toContain(`assets/${h2}.glb`);
  });
});

describe('package-gforge verification', () => {
  it('verifies internal structure of a freshly built package', () => {
    const bytes = new Uint8Array([5, 6, 7]);
    const hash = realHash(bytes);
    const entries = buildDraftEntries({
      snapshot: snapshot('V'),
      assets: new Map([[hash, assetBytes(hash, 'glb', bytes)]]),
    });
    const manifest = verifyPackageStructure(entries);
    expect(manifest.format).toBe('gforge');
    expect(manifest.packageType).toBe('draft');
    // manifest.json is not listed inside itself.
    expect(manifest.entries.length).toBe(entries.length - 1);
  });

  it('detects a one-byte tamper via hash mismatch', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = realHash(bytes);
    const entries = buildDraftEntries({
      snapshot: snapshot('T'),
      assets: new Map([[hash, assetBytes(hash, 'glb', bytes)]]),
    });
    const target = entries.find((e) => e.path === 'guide.json');
    expect(target).toBeDefined();
    const tampered = target!.data.slice();
    tampered[0] = tampered[0]! ^ 0xff;
    target!.data = tampered;
    expect(() => verifyPackageStructure(entries)).toThrow(/hash mismatch for guide.json/);
  });

  it('rejects entries that are not bound by the manifest', () => {
    const entries = buildDraftEntries({ snapshot: snapshot('Bound'), assets: new Map() });
    entries.push({ path: 'rogue.json', data: new Uint8Array([1]) });
    expect(() => verifyPackageStructure(entries)).toThrow(/unlisted package entry/);
  });
});

describe('package-gforge bounded archive preflight', () => {
  it('accepts a normal package archive', () => {
    const bytes = createDraftPackage({ snapshot: snapshot('Preflight'), assets: new Map() });
    const result = preflightZipArchive(bytes);
    expect(result.entryCount).toBe(2); // guide.json + manifest.json
    expect(result.totalUncompressed).toBeGreaterThan(0);
  });

  it('rejects a zip bomb via compression ratio before inflation', () => {
    // A 1 MB entry of zeros compresses to a few KB; fflate deflates it. The
    // preflight must reject the ratio without ever inflating the full data.
    const big = new Uint8Array(1024 * 1024); // zeros — highly compressible
    const bomb = zipSync({ 'bomb.bin': big }, { level: 9 });
    expect(() => preflightZipArchive(bomb)).toThrow(/compression ratio exceeded/);
  });

  it('rejects unsafe entry paths during preflight (no extraction)', () => {
    const evil = zipSync({ '../escape.txt': new Uint8Array([1]) });
    expect(() => preflightZipArchive(evil)).toThrow(/unsafe entry path rejected/);
    expect(() => extractZipArchive(evil)).toThrow(/unsafe entry path rejected/);
  });

  it('rejects non-zip input', () => {
    expect(() => preflightZipArchive(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/no EOCD/);
  });
});

describe('package-gforge attribution report (Phase 04)', () => {
  it('emits reports/asset-licenses.json with licenses and attribution', () => {
    const hash = realHash(new Uint8Array([9, 9, 9]));
    const attributions = new Map<
      string,
      { name: string; licenseId?: string; attribution?: string }
    >([[hash, { name: 'Pipette', licenseId: 'CC0', attribution: 'GuideForge' }]]);
    const entries = buildDraftEntries({
      snapshot: snapshot('Attributed'),
      assets: new Map([[hash, assetBytes(hash, 'glb', new Uint8Array([9, 9, 9]))]]),
      attributions: attributions as Map<
        ContentHash,
        { name: string; licenseId?: string; attribution?: string; source?: string }
      >,
    });
    const reportEntry = entries.find((e) => e.path === 'reports/asset-licenses.json');
    expect(reportEntry).toBeDefined();
    const report = JSON.parse(new TextDecoder().decode(reportEntry!.data)) as {
      format: string;
      assets: { hash: string; name: string; licenseId: string }[];
    };
    expect(report.format).toBe('gforge-asset-licenses');
    expect(report.assets[0]!.name).toBe('Pipette');
    expect(report.assets[0]!.licenseId).toBe('CC0');
  });

  it('omits the report when no attributions are provided', () => {
    const entries = buildDraftEntries({ snapshot: snapshot('NoAttrib'), assets: new Map() });
    expect(entries.some((e) => e.path === 'reports/asset-licenses.json')).toBe(false);
  });
});

describe('package-gforge v2 portability', () => {
  it('stores source metadata, optional source bytes, reports, and backup evidence', async () => {
    const sourceHash = realHash(new Uint8Array([4, 5, 6]));
    const source = {
      sourceId: '123e4567-e89b-42d3-a456-426614174001' as GuideSnapshot['guideId'],
      sha256: sourceHash,
      originalName: 'procedure.txt',
      mediaType: 'text/plain',
      kind: 'text' as const,
      sizeBytes: 3,
      pageCount: 1,
      durationMs: null,
      receivedAtIso: FIXED_TIMESTAMP,
      pipeline: 'text-source',
      pipelineVersion: '1',
      status: 'ready' as const,
      regions: [],
      provenanceReceipt: {},
    };
    const entries = buildDraftEntries({
      snapshot: { ...snapshot('Portable'), sources: [source] },
      assets: new Map(),
      packageType: 'backup',
      sourceBytes: new Map([[sourceHash, { bytes: new Uint8Array([4, 5, 6]), extension: 'txt' }]]),
      reports: {
        generation: { runId: 'run-1', status: 'complete' },
        validation: { missingAssets: [] },
        cost: { inputTokens: 3 },
      },
      runtime: {
        evidenceRecords: [{ evidenceId: 'e-1', stepId: 'step-1', kind: 'note' }],
      },
    });

    const manifest = verifyPackageStructure(entries);
    expect(manifest.version).toBe(2);
    expect(manifest.packageType).toBe('backup');
    expect(entries.map((entry) => entry.path)).toEqual([
      'guide.json',
      'manifest.json',
      'reports/cost.json',
      'reports/generation.json',
      'reports/validation.json',
      'runtime/evidence/index.json',
      'sources/123e4567-e89b-42d3-a456-426614174001.json',
      `sources/${sourceHash}.txt`,
    ]);

    const extracted = await extractZipArchive(
      createDraftPackage({
        snapshot: { ...snapshot('Portable'), sources: [source] },
        assets: new Map(),
        packageType: 'backup',
        sourceBytes: new Map([
          [sourceHash, { bytes: new Uint8Array([4, 5, 6]), extension: 'txt' }],
        ]),
      }),
    );
    expect(extracted.some((entry) => entry.path.endsWith('.txt'))).toBe(true);
  });

  it('sanitizes active and external resource values before metadata use', () => {
    expect(sanitizeExternalResource('https://example.test/source')).toBe(
      'https://example.test/source',
    );
    expect(sanitizeExternalResource('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalResource('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(() => sanitizePackageMetadata({ href: 'javascript:alert(1)' })).toThrow(
      /unsafe external resource/,
    );
    expect(sanitizePackageMetadata({ title: 'plain text', count: 2 })).toEqual({
      title: 'plain text',
      count: 2,
    });
  });
});
