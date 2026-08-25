/**
 * Central browser capability probe for secure-context-dependent APIs.
 *
 * Web Crypto (SubtleCrypto), crypto.randomUUID, and OPFS are only exposed in
 * secure contexts (HTTPS, or localhost during development). GuideForge's
 * content-addressed asset storage requires them; this probe turns an opaque
 * `TypeError: Cannot read properties of undefined` into one actionable,
 * testable diagnostic. Capability detection only — never device-name guessing.
 */

export interface BrowserCapabilities {
  secureContext: boolean;
  webCrypto: boolean;
  randomUuid: boolean;
  opfs: boolean;
}

function currentOrigin(): string {
  try {
    return globalThis.location?.origin ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getBrowserCapabilities(): BrowserCapabilities {
  const secureContext =
    typeof globalThis.window !== 'undefined' ? window.isSecureContext === true : false;
  const cryptoRef: Crypto | undefined = globalThis.crypto;
  return {
    secureContext,
    webCrypto: typeof cryptoRef?.subtle?.digest === 'function',
    randomUuid: typeof cryptoRef?.randomUUID === 'function',
    opfs: typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function',
  };
}

/**
 * Throws an actionable Error explaining the HTTPS requirement when the asset
 * pipeline cannot run (no secure context / no Web Crypto). OPFS absence is not
 * fatal — storage-web falls back to IndexedDB.
 */
export function assertAssetStorageSupported(): void {
  const caps = getBrowserCapabilities();
  if (caps.webCrypto) return;
  throw new Error(
    `Asset storage requires a secure browser context. Open GuideForge over HTTPS ` +
      `(or localhost for development). Current origin: ${currentOrigin()}` +
      (caps.opfs ? '' : ' OPFS is unavailable here; assets will fall back to IndexedDB.'),
  );
}
