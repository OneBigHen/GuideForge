import { describe, expect, it } from 'vitest';
import { assertSafeBindConfig } from './bind-guard.js';

describe('assertSafeBindConfig', () => {
  it('allows loopback binding without a configured owner (local dev)', () => {
    expect(() => assertSafeBindConfig('127.0.0.1', undefined)).not.toThrow();
    expect(() => assertSafeBindConfig('localhost', undefined)).not.toThrow();
    expect(() => assertSafeBindConfig('::1', undefined)).not.toThrow();
  });

  it('allows non-loopback binding when an owner is configured', () => {
    expect(() => assertSafeBindConfig('0.0.0.0', 'owner-id')).not.toThrow();
    expect(() => assertSafeBindConfig('10.0.0.5', 'owner-id')).not.toThrow();
  });

  it('refuses non-loopback binding without a configured owner', () => {
    expect(() => assertSafeBindConfig('0.0.0.0', undefined)).toThrow(/GUIDEFORGE_OWNER_ID/);
    expect(() => assertSafeBindConfig('10.0.0.5', '')).toThrow(/GUIDEFORGE_OWNER_ID/);
  });
});
