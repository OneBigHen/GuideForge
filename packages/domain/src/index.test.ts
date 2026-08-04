import { describe, expect, it } from 'vitest';
import { isContentHash, isEntityId, isGuideLifecycleState } from './index.js';

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
});
