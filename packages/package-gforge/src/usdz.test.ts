import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildUsdzContainer, quickLookModelLink, USDZ_MIME } from './index.js';

describe('usdz container', () => {
  it('wraps usdc + texture deterministically', () => {
    const files = new Map([
      ['model.usdc', new Uint8Array([1, 2, 3])],
      ['textures/a.png', new Uint8Array([9, 9])],
    ]);
    const a = buildUsdzContainer({ files });
    const b = buildUsdzContainer({ files });
    expect(a).toEqual(b);
    const entries = unzipSync(a);
    expect(Object.keys(entries)).toContain('model.usdc');
    expect(Object.keys(entries)).toContain('textures/a.png');
  });

  it('rejects unsafe entry names', () => {
    const files = new Map([['../escape.usdc', new Uint8Array([1])]]);
    expect(() => buildUsdzContainer({ files })).toThrow(/unsafe/);
  });

  it('builds a Quick Look rel=ar link', () => {
    const link = quickLookModelLink({
      usdzUrl: 'https://cdn.example/model.usdz',
      posterUrl: 'https://cdn.example/p.png',
    });
    expect(link.rel).toBe('ar');
    expect(link.type).toBe(USDZ_MIME);
    expect(link.poster).toBe('https://cdn.example/p.png');
  });
});
