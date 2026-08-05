import { describe, expect, it } from 'vitest';
import {
  isCommandOrigin,
  isContentHash,
  isEntityId,
  isGuideLifecycleState,
  isReleaseStatus,
  isUnitQuaternion,
  sha256Hex,
  type SpatialTransform,
} from './index.js';

describe('domain value guards', () => {
  it('validates entity IDs', () => {
    expect(isEntityId('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isEntityId('not-a-uuid')).toBe(false);
  });

  it('validates content hashes', () => {
    expect(isContentHash('a'.repeat(64))).toBe(true);
    expect(isContentHash('abc')).toBe(false);
  });

  it('computes real SHA-256 (known test vectors, never a padded short hash)', () => {
    const enc = new TextEncoder();
    // NIST / FIPS 180-4 test vectors.
    expect(sha256Hex(enc.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(enc.encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    // Digest is exactly 64 lowercase hex chars (ContentHash contract).
    const digest = sha256Hex(enc.encode('GuideForge content identity'));
    expect(isContentHash(digest)).toBe(true);
    // Deterministic and byte-sensitive.
    expect(sha256Hex(enc.encode('a'))).toBe(sha256Hex(enc.encode('a')));
    expect(sha256Hex(enc.encode('a'))).not.toBe(sha256Hex(enc.encode('b')));
  });

  it('validates lifecycle states', () => {
    expect(isGuideLifecycleState('released')).toBe(true);
    expect(isGuideLifecycleState('releasedX')).toBe(false);
  });

  it('validates command origins', () => {
    expect(isCommandOrigin('ai-proposal-accept')).toBe(true);
    expect(isCommandOrigin('user')).toBe(true);
    expect(isCommandOrigin('remote')).toBe(false);
  });

  it('validates release statuses', () => {
    expect(isReleaseStatus('revoked')).toBe(true);
    expect(isReleaseStatus('draft')).toBe(false);
  });

  it('validates unit quaternions', () => {
    const identity: SpatialTransform['rotation'] = { w: 1, x: 0, y: 0, z: 0 };
    expect(isUnitQuaternion(identity)).toBe(true);
    const scaled = { w: 2, x: 0, y: 0, z: 0 };
    expect(isUnitQuaternion(scaled)).toBe(false);
  });
});
