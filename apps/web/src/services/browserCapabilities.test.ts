import { afterEach, describe, expect, it } from 'vitest';
import {
  assertAssetStorageSupported,
  getBrowserCapabilities,
  type BrowserCapabilities,
} from './browserCapabilities';

interface MutableWindow {
  isSecureContext?: boolean;
}

function installEnv(opts: {
  secureContext: boolean;
  hasCrypto: boolean;
  hasSubtle: boolean;
  hasRandomUuid: boolean;
  hasOpfs: boolean;
}): void {
  const win = window as unknown as MutableWindow & Record<string, unknown>;
  Object.defineProperty(win, 'isSecureContext', { configurable: true, value: opts.secureContext });
  if (opts.hasCrypto) {
    const subtle = opts.hasSubtle
      ? { digest: () => Promise.resolve(new ArrayBuffer(0)) }
      : undefined;
    const randomUUID = opts.hasRandomUuid ? () => 'test-uuid' : undefined;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: () => new Uint8Array(1), subtle, randomUUID },
    });
  } else {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  }
  const storage = opts.hasOpfs ? { getDirectory: () => Promise.resolve({}) } : undefined;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { ...(globalThis.navigator ?? {}), storage },
  });
}

const SECURE_ENV = {
  secureContext: true,
  hasCrypto: true,
  hasSubtle: true,
  hasRandomUuid: true,
  hasOpfs: true,
};

afterEach(() => {
  // Restore the jsdom + node-webcrypto baseline installed by src/test/setup.ts.
  delete (window as unknown as MutableWindow).isSecureContext;
});

describe('getBrowserCapabilities', () => {
  it('reports a fully capable secure browser', () => {
    installEnv(SECURE_ENV);
    expect(getBrowserCapabilities()).toEqual<BrowserCapabilities>({
      secureContext: true,
      webCrypto: true,
      randomUuid: true,
      opfs: true,
    });
  });

  it('flags missing Web Crypto on an insecure LAN HTTP origin', () => {
    installEnv({
      secureContext: false,
      hasCrypto: true,
      hasSubtle: false,
      hasRandomUuid: false,
      hasOpfs: false,
    });
    const caps = getBrowserCapabilities();
    expect(caps.secureContext).toBe(false);
    expect(caps.webCrypto).toBe(false);
    expect(caps.randomUuid).toBe(false);
    expect(caps.opfs).toBe(false);
  });

  it('treats crypto present without subtle as no Web Crypto', () => {
    installEnv({ ...SECURE_ENV, hasSubtle: false });
    expect(getBrowserCapabilities().webCrypto).toBe(false);
  });
});

describe('assertAssetStorageSupported', () => {
  it('passes when the context is secure and Web Crypto exists', () => {
    installEnv(SECURE_ENV);
    expect(() => assertAssetStorageSupported()).not.toThrow();
  });

  it('throws an actionable error naming HTTPS and the current origin when insecure', () => {
    installEnv({
      secureContext: false,
      hasCrypto: false,
      hasSubtle: false,
      hasRandomUuid: false,
      hasOpfs: false,
    });
    let message = '';
    try {
      assertAssetStorageSupported();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('secure');
    expect(message.toLowerCase()).toContain('https');
    expect(message).toContain('localhost');
    expect(message).toContain(location.origin);
  });

  it('throws the same actionable error when only SubtleCrypto is missing', () => {
    installEnv({ ...SECURE_ENV, hasSubtle: false, hasRandomUuid: false });
    try {
      assertAssetStorageSupported();
      expect.unreachable('assert should have thrown');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('HTTPS');
      expect(message).not.toContain('Cannot read properties of undefined');
    }
  });
});
