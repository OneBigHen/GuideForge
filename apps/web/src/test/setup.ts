// Minimal jsdom test setup for apps/web.
// jsdom does not implement window.matchMedia; ThemeToggle relies on it.
// fake-indexeddb + node webcrypto provide the browser storage/crypto surface
// used by storage-web (Dexie + OPFS fallback) in every test file.

import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      addListener: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      removeListener: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      addEventListener: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Ensure a real crypto implementation is available (jsdom's is not a full
// WebCrypto); storage-web hashes content with crypto.subtle.
if (typeof globalThis.crypto?.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
