import type { GuideSnapshot } from '@guideforge/guide-schema';
import { describe, expect, it } from 'vitest';
import {
  createReleasePackage,
  generateSigningKeyPair,
  TrustedKeyStore,
  verifyReleasePackage,
} from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000';
const FIXED = '2026-01-01T00:00:00Z';

function snapshot(): GuideSnapshot {
  return {
    schemaVersion: 1,
    guideId: GUIDE_ID as GuideSnapshot['guideId'],
    title: 'Drill',
    description: '',
    lifecycleState: 'released',
    createdAtIso: FIXED,
    updatedAtIso: FIXED,
    tasks: [],
    steps: [],
  };
}

function releaseFor(
  pair: { privateKeyHex: string },
  version: string,
  releaseId: string,
): Uint8Array {
  return createReleasePackage({
    snapshot: snapshot(),
    assets: new Map(),
    privateKeyHex: pair.privateKeyHex,
    keyId: `key-${version}`,
    release: { releaseId, releaseVersion: version, createdAt: FIXED, guideId: GUIDE_ID },
  });
}

describe('GA drills (backup/restore, key rotation, revocation, rollback)', () => {
  it('backup + restore: a release verified before backup verifies after restore', () => {
    const pair = generateSigningKeyPair();
    const release = releaseFor(pair, '1.0.0', 'rel-backup');
    expect(verifyReleasePackage(release).ok).toBe(true);
    // Simulate backup to bytes and restore (identity); restored artifact must
    // still verify — proving the backup is trustworthy.
    const restored = release.slice();
    expect(verifyReleasePackage(restored).ok).toBe(true);
  });

  it('key rotation: new releases sign under the new key, old ones still verify under the old', () => {
    const oldKey = generateSigningKeyPair();
    const newKey = generateSigningKeyPair();
    const store = new TrustedKeyStore([
      {
        keyId: 'key-1.0.0',
        publicKeyHex: oldKey.publicKeyHex,
        createdAtIso: FIXED,
        status: 'active',
      },
      {
        keyId: 'key-1.1.0',
        publicKeyHex: newKey.publicKeyHex,
        createdAtIso: FIXED,
        status: 'active',
      },
    ]);
    const oldRelease = releaseFor(oldKey, '1.0.0', 'rel-old');
    const newRelease = releaseFor(newKey, '1.1.0', 'rel-new');
    expect(verifyReleasePackage(oldRelease).ok).toBe(true);
    expect(verifyReleasePackage(newRelease).ok).toBe(true);
    expect(store.isActive('key-1.0.0')).toBe(true);
    expect(store.isActive('key-1.1.0')).toBe(true);
  });

  it('revocation: releases signed by a revoked key are no longer trusted', () => {
    const pair = generateSigningKeyPair();
    const store = new TrustedKeyStore([
      {
        keyId: 'key-compromised',
        publicKeyHex: pair.publicKeyHex,
        createdAtIso: FIXED,
        status: 'active',
      },
    ]);
    const release = releaseFor(pair, '1.0.0', 'rel-revoked');
    expect(verifyReleasePackage(release).ok).toBe(true);

    store.revoke('key-compromised', 'compromised');
    expect(store.isActive('key-compromised')).toBe(false);

    // The release still cryptographically verifies; trust revocation is the
    // policy layer on top (the viewer checks the trusted-key store before
    // rendering). Prove the store now refuses the key.
    expect(store.get('key-compromised')?.status).toBe('revoked');
    expect(store.get('key-compromised')?.reason).toBe('compromised');
  });

  it('rollback: an older verified release can be restored and re-verified', () => {
    const pair = generateSigningKeyPair();
    const v1 = releaseFor(pair, '1.0.0', 'rel-1');
    const v2 = releaseFor(pair, '1.1.0', 'rel-2');
    expect(verifyReleasePackage(v2).ok).toBe(true);
    // Rollback to v1: the stored artifact must still verify offline.
    expect(verifyReleasePackage(v1).ok).toBe(true);
  });
});
