import type { ContentHash, EntityId } from '@guideforge/domain';
import { describe, expect, it } from 'vitest';
import {
  decideLicense,
  generateProceduralGlb,
  inspectGlb,
  inspectModel,
  planAssetSearch,
  PROCEDURAL_TEMPLATES,
  searchAssets,
  tokenize,
  type AssetMetadata,
  type AssetOrigin,
} from './index.js';

function asset(name: string, overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return {
    assetId: crypto.randomUUID() as EntityId,
    contentHash: ('a'.repeat(62) + 'aa') as ContentHash,
    derivativeHashes: [],
    name,
    aliases: [],
    tags: [],
    format: 'glb',
    mimeTypes: ['model/gltf-binary'],
    sizeBytes: 1,
    dimensionsMeters: null,
    origin: { kind: 'import' },
    reviewState: 'visually-reviewed',
    geometryHealth: null,
    semanticAliases: [],
    semanticAnchors: [],
    usedByProjectIds: [],
    createdAtIso: '2026-01-01T00:00:00Z',
    updatedAtIso: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('assets: local search', () => {
  it('ranks exact name > substring > alias/tag', () => {
    const beaker = asset('Beaker', { aliases: ['glass'], tags: ['lab'] });
    const bigBeaker = asset('Big Beaker');
    const flask = asset('Erlenmeyer Flask');
    const results = searchAssets([flask, bigBeaker, beaker], { text: 'beaker' });
    expect(results[0]!.name).toBe('Beaker');
    expect(results[1]!.name).toBe('Big Beaker');
    expect(results.find((r) => r.name === 'Erlenmeyer Flask')).toBeUndefined();
  });

  it('finds by alias and respects format filter', () => {
    const pipette = asset('Pipette', { aliases: ['micropipette'], format: 'glb' });
    const stl = asset('Pipette STL', { format: 'stl' });
    const all = searchAssets([pipette, stl], { text: 'micropipette' });
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Pipette');
    const onlyStl = searchAssets([pipette, stl], { text: 'pipette', format: ['stl'] });
    expect(onlyStl[0]!.name).toBe('Pipette STL');
  });

  it('tokenizes deterministically', () => {
    // Non-ASCII (µ) is stripped; tokens are lowercase alphanumeric.
    expect(tokenize('Test-Tube 100 µL')).toEqual(['test', 'tube', '100']);
  });
});

describe('assets: license policy', () => {
  it('allows CC0 freely', () => {
    const d = decideLicense({ kind: 'provider', licenseId: 'CC0' });
    expect(d.allowPackageEmbedding).toBe(true);
    expect(d.requiresAttribution).toBe(false);
  });

  it('requires attribution for MIT/Apache/CC-BY', () => {
    for (const id of ['MIT', 'Apache-2.0', 'CC-BY-4.0']) {
      const d = decideLicense({ kind: 'provider', licenseId: id });
      expect(d.requiresAttribution).toBe(true);
      expect(d.allowPackageEmbedding).toBe(true);
    }
  });

  it('blocks GPL/AGPL and unknown licenses', () => {
    expect(decideLicense({ kind: 'provider', licenseId: 'GPL-3.0' }).allowPackageEmbedding).toBe(
      false,
    );
    expect(
      decideLicense({ kind: 'provider', licenseId: 'SOMETHING-ODD' }).allowPackageEmbedding,
    ).toBe(false);
    expect(
      decideLicense({ kind: 'provider', licenseId: 'SOMETHING-ODD' }).blocks.length,
    ).toBeGreaterThan(0);
  });

  it('fails closed when a license is missing or explicitly unlicensed', () => {
    for (const origin of [
      { kind: 'provider' as const },
      { kind: 'provider' as const, licenseId: 'UNLICENSED' },
    ]) {
      const decision = decideLicense(origin);
      expect(decision.allowPackageEmbedding).toBe(false);
      expect(decision.allowPublicRedistribution).toBe(false);
      expect(decision.blocks[0]).toContain('unknown license');
    }
  });

  it('blocks share-alike embedding in public releases', () => {
    const d = decideLicense(
      { kind: 'provider', licenseId: 'CC-BY-SA-4.0' },
      { publicRelease: true },
    );
    expect(d.allowPackageEmbedding).toBe(false);
  });
});

describe('assets: procedural templates', () => {
  it('defines all required scientific templates', () => {
    expect(PROCEDURAL_TEMPLATES['simple-pipette']).toBeDefined();
    expect(PROCEDURAL_TEMPLATES['peristaltic-pump']).toBeDefined();
    expect(PROCEDURAL_TEMPLATES['balance-proxy']).toBeDefined();
    expect(PROCEDURAL_TEMPLATES.workbench).toBeDefined();
  });

  it('generates a deterministic valid GLB', () => {
    const a = generateProceduralGlb('simple-pipette');
    const b = generateProceduralGlb('simple-pipette');
    expect(a.length).toBe(b.length);
    // GLB magic + version.
    const dv = new DataView(a.buffer);
    expect(
      String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)),
    ).toBe('glTF');
    expect(dv.getUint32(4, true)).toBe(2);
    // Deterministic: identical bytes for identical input.
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('marks generated assets as approximations (not dimensionally verified)', () => {
    const balance = PROCEDURAL_TEMPLATES['balance-proxy'];
    expect(balance.description).toContain('approximation');
  });

  it('inspects generated GLB bytes and rejects external glTF resources', () => {
    const inspection = inspectGlb(generateProceduralGlb('simple-pipette'));
    expect(inspection.safe).toBe(true);
    expect(inspection.geometryHealth?.triangleCount).toBe(12);
    expect(
      inspectModel(
        new TextEncoder().encode('{"buffers":[{"uri":"https://evil.test/a.bin"}]}'),
        'gltf',
      ).safe,
    ).toBe(false);
  });

  it('plans local-first provider requests with normalized bounded queries', () => {
    const plan = planAssetSearch([asset('Pipette')], '  micropipette<script>  ');
    expect(plan.local).toHaveLength(0);
    expect(plan.providers).toHaveLength(5);
    expect(plan.providers[0]?.query).toBe('micropipette script');
    expect(plan.providers[0]?.url).not.toContain('<');
  });
});

function unusedOrigin(_o: AssetOrigin): void {
  void _o;
}
void unusedOrigin;
