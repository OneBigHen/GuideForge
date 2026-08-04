import { describe, expect, it } from 'vitest';
import {
  isCommandOrigin,
  isContentHash,
  isEntityId,
  isGuideLifecycleState,
  isReleaseStatus,
  isUnitQuaternion,
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
