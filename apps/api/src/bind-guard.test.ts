import { describe, expect, it } from 'vitest';
import { assertSafeBindConfig } from './bind-guard.js';

describe('assertSafeBindConfig', () => {
  it('allows loopback binding without a configured owner (local dev)', () => {
    expect(() => assertSafeBindConfig('127.0.0.1', undefined, undefined)).not.toThrow();
    expect(() => assertSafeBindConfig('localhost', undefined, undefined)).not.toThrow();
    expect(() => assertSafeBindConfig('::1', undefined, undefined)).not.toThrow();
  });

  it('allows non-loopback binding when an owner identity AND credential are configured', () => {
    expect(() => assertSafeBindConfig('0.0.0.0', 'owner-id', 'correct-horse')).not.toThrow();
    expect(() =>
      assertSafeBindConfig('10.0.0.5', 'owner-id', 'battery-staple'),
    ).not.toThrow();
  });

  it('refuses non-loopback binding without a configured owner', () => {
    expect(() => assertSafeBindConfig('0.0.0.0', undefined, undefined)).toThrow(
      /GUIDEFORGE_OWNER_ID/,
    );
    expect(() => assertSafeBindConfig('10.0.0.5', '', 'secret')).toThrow(/GUIDEFORGE_OWNER_ID/);
  });

  it('refuses non-loopback binding without the owner credential (Phase 5 gate)', () => {
    // Knowing the owner UUID must not be sufficient at a public boundary.
    expect(() => assertSafeBindConfig('0.0.0.0', 'owner-id', undefined)).toThrow(
      /GUIDEFORGE_OWNER_PASSWORD/,
    );
    expect(() => assertSafeBindConfig('10.0.0.5', 'owner-id', '')).toThrow(
      /GUIDEFORGE_OWNER_PASSWORD/,
    );
  });
});
