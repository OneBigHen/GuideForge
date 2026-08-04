/**
 * Coordinated PWA registration.
 *
 * - Registers the Workbox-generated service worker only in production.
 * - Never lets an incompatible worker take over an open editor session:
 *   the app calls `activateUpdate()` from a UI prompt when it is safe.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // Expose update readiness via a custom event the shell listens for.
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('guideforge:update-ready'));
          }
        });
      });
    });
  }
}

/** Activate a pending service-worker update (call from a user prompt). */
export async function activateUpdate(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const waiting = reg?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}
