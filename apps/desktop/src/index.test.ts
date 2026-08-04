import { describe, expect, it } from 'vitest';
import { desktopShellInfo, isGuideSnapshot } from './index.js';

describe('desktop shell', () => {
  it('is a thin wrapper around the web product', () => {
    expect(desktopShellInfo()).toEqual({
      app: 'guideforge-desktop',
      product: 'guideforge-web',
    });
  });

  it('shares the canonical schema, not a second editor', () => {
    expect(isGuideSnapshot({ schemaVersion: 1, title: 'x' })).toBe(false);
  });
});
