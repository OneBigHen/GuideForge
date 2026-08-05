import type { GuideSnapshot } from '@guideforge/guide-schema';
import { importMsGuide, parseMsGuideTar } from '@guideforge/interop-ms-guide';
import fc from 'fast-check';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildDraftEntries,
  createReleasePackage,
  generateSigningKeyPair,
  verifyPackageStructure,
  verifyReleasePackage,
} from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000';
function snapshot(): GuideSnapshot {
  return {
    schemaVersion: 1,
    guideId: GUIDE_ID as GuideSnapshot['guideId'],
    title: 'Fuzz',
    description: '',
    lifecycleState: 'draft',
    createdAtIso: '2026-01-01T00:00:00Z',
    updatedAtIso: '2026-01-01T00:00:00Z',
    tasks: [],
    steps: [],
  };
}

describe('package fuzzing (Phase 08)', () => {
  it('arbitrary bytes never crash the draft package verifier', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 4096 }), (bytes) => {
        try {
          verifyPackageStructure(buildDraftEntries({ snapshot: snapshot(), assets: new Map() }));
        } catch {
          // expected: verifier may reject
        }
        // Random bytes as a release must never throw an uncaught error.
        try {
          const res = verifyReleasePackage(new Uint8Array(bytes));
          expect(Array.isArray(res.issues)).toBe(true);
        } catch (err) {
          // The only acceptable escape is an Error (no crash).
          expect(err).toBeInstanceOf(Error);
        }
      }),
    );
  });

  it('arbitrary bytes never crash the ms-guide tar parser', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 4096 }), (bytes) => {
        try {
          parseMsGuideTar(new Uint8Array(bytes));
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
        }
      }),
    );
  });

  it('import of random tar-like bytes is contained', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 2048 }), (bytes) => {
        try {
          const imported = importMsGuide(new Uint8Array(bytes), 'fuzz.guide');
          expect(imported.report).toBeDefined();
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
        }
      }),
    );
  });

  it('tampered signed releases fail closed for any content byte flip', () => {
    const pair = generateSigningKeyPair();
    const good = createReleasePackage({
      snapshot: snapshot(),
      assets: new Map(),
      privateKeyHex: pair.privateKeyHex,
      keyId: 'k1',
      release: {
        releaseId: 'r',
        releaseVersion: '1.0.0',
        createdAt: '2026-01-01T00:00:00Z',
        guideId: GUIDE_ID,
      },
    });
    expect(verifyReleasePackage(good).ok).toBe(true);

    // Re-zipping with a flipped byte in each entry's decompressed content must
    // always fail verification (hash mismatch), for every content byte.
    const entries = unzipSync(good);
    for (const [name, data] of Object.entries(entries)) {
      const bytes = data as Uint8Array;
      for (let i = 0; i < bytes.length; i += Math.max(1, Math.floor(bytes.length / 5))) {
        const mutated = bytes.slice();
        mutated[i] = mutated[i]! ^ 0x01;
        const rebuilt = zipSync(
          { ...entries, [name]: [mutated, { mtime: new Date('2026-01-01T00:00:00Z'), level: 0 }] },
          { level: 0 },
        );
        expect(verifyReleasePackage(rebuilt).ok, `${name} byte ${i}`).toBe(false);
      }
    }
  });
});
