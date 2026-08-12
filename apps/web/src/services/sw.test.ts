import { describe, expect, it, vi } from 'vitest';
import { activateUpdate } from './sw';

describe('service-worker update activation', () => {
  it('asks a waiting worker to activate only after the user action', async () => {
    const postMessage = vi.fn();
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue({ waiting: { postMessage } }) },
    });
    try {
      await activateUpdate();
      expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    } finally {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: original });
    }
  });

  it('does nothing when no update is waiting', async () => {
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
    try {
      await expect(activateUpdate()).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: original });
    }
  });
});
