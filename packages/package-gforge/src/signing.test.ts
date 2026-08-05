import type { GuideSnapshot } from '@guideforge/guide-schema';
import { describe, expect, it } from 'vitest';
import {
  canonicalJsonRfc8785,
  createReleasePackage,
  generateSigningKeyPair,
  signReleasePayload,
  TrustedKeyStore,
  verifyReleasePackage,
  verifyReleaseSignature,
} from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000';
const FIXED = '2026-01-01T00:00:00.000Z';

function snapshot(title: string): GuideSnapshot {
  return {
    schemaVersion: 2,
    guideId: GUIDE_ID as GuideSnapshot['guideId'],
    title,
    description: '',
    lifecycleState: 'draft',
    createdAtIso: FIXED,
    updatedAtIso: FIXED,
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
}

describe('RFC 8785 canonicalization', () => {
  it('produces the RFC 8785 canonical form (sorted keys, compact)', () => {
    const out = canonicalJsonRfc8785({ b: 2, a: { d: 1, c: [1, 2] }, z: 'x' });
    expect(out).toBe('{"a":{"c":[1,2],"d":1},"b":2,"z":"x"}');
  });
});

describe('release signing and verification', () => {
  it('signs and verifies a payload', () => {
    const pair = generateSigningKeyPair();
    const signed = signReleasePayload({ releaseId: 'r1', version: '1.0.0' }, pair.privateKeyHex);
    expect(verifyReleaseSignature(signed.payloadJson, signed.signature, signed.publicKey)).toBe(
      true,
    );
  });

  it('rejects a signature under a different key', () => {
    const a = generateSigningKeyPair();
    const b = generateSigningKeyPair();
    const signed = signReleasePayload({ x: 1 }, a.privateKeyHex);
    const bPublicKey = Uint8Array.from(b.publicKeyHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    expect(verifyReleaseSignature(signed.payloadJson, signed.signature, bPublicKey)).toBe(false);
  });

  it('round-trips a release package and verifies offline', () => {
    const pair = generateSigningKeyPair();
    const bytes = createReleasePackage({
      snapshot: snapshot('Release'),
      assets: new Map(),
      privateKeyHex: pair.privateKeyHex,
      keyId: 'key-1',
      release: { releaseId: 'rel-1', releaseVersion: '1.0.0', createdAt: FIXED, guideId: GUIDE_ID },
    });
    const res = verifyReleasePackage(bytes);
    expect(res.ok).toBe(true);
    expect(res.payload?.releaseId).toBe('rel-1');
  });

  it('one-byte tampering fails verification', () => {
    const pair = generateSigningKeyPair();
    const bytes = createReleasePackage({
      snapshot: snapshot('Tamper'),
      assets: new Map(),
      privateKeyHex: pair.privateKeyHex,
      keyId: 'key-1',
      release: { releaseId: 'rel-2', releaseVersion: '1.0.0', createdAt: FIXED, guideId: GUIDE_ID },
    });
    // Flip a byte in the guide.json payload region (find the marker).
    const idx = bytes.findIndex(
      (b, i) => bytes[i] === 0x54 && bytes[i + 1] === 0x61 && bytes[i + 2] === 0x6d, // "Tam"
    );
    expect(idx).toBeGreaterThan(-1);
    const tampered = bytes.slice();
    tampered[idx] = tampered[idx]! ^ 0xff;
    const res = verifyReleasePackage(tampered);
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('deterministic: same inputs produce identical package bytes', () => {
    const pair = generateSigningKeyPair();
    const input = {
      snapshot: snapshot('Det'),
      assets: new Map(),
      privateKeyHex: pair.privateKeyHex,
      keyId: 'key-1',
      release: { releaseId: 'rel-3', releaseVersion: '1.0.0', createdAt: FIXED, guideId: GUIDE_ID },
    };
    const a = createReleasePackage(input);
    const b = createReleasePackage(input);
    expect(a).toEqual(b);
  });
});

describe('trusted key management', () => {
  it('tracks activation, rotation, and revocation', () => {
    const pair = generateSigningKeyPair();
    const store = new TrustedKeyStore([
      { keyId: 'key-1', publicKeyHex: pair.publicKeyHex, createdAtIso: FIXED, status: 'active' },
    ]);
    expect(store.isActive('key-1')).toBe(true);
    expect(store.isActive('missing')).toBe(false);

    store.revoke('key-1', 'compromised');
    expect(store.isActive('key-1')).toBe(false);
    expect(store.get('key-1')?.status).toBe('revoked');
    expect(store.get('key-1')?.reason).toBe('compromised');
  });

  it('rejects duplicate key ids', () => {
    const pair = generateSigningKeyPair();
    const store = new TrustedKeyStore();
    store.add({
      keyId: 'k',
      publicKeyHex: pair.publicKeyHex,
      createdAtIso: FIXED,
      status: 'active',
    });
    expect(() =>
      store.add({
        keyId: 'k',
        publicKeyHex: pair.publicKeyHex,
        createdAtIso: FIXED,
        status: 'active',
      }),
    ).toThrow(/already exists/);
  });
});
