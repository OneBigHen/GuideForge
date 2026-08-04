/**
 * Device capability profile — capability detection, not UA-only branching.
 * Mirrors the shape in docs/WEB_IPAD_IPHONE_UX.md.
 */
export interface DeviceCapabilityProfile {
  pointer: {
    coarse: boolean;
    hover: boolean;
    pen: boolean;
    maxTouchPoints: number;
  };
  graphics: {
    webgl2: boolean;
    estimatedTier: 'low' | 'medium' | 'high';
    maxTextureSize: number;
  };
  storage: {
    indexedDb: boolean;
    opfs: boolean;
    persistentStorageGranted: boolean;
  };
  platform: {
    standalonePwa: boolean;
    tauri: boolean;
    appleQuickLook: boolean;
  };
}

export function detectCapabilities(): DeviceCapabilityProfile {
  const nav = navigator;
  const win = window;
  const media =
    typeof win.matchMedia === 'function'
      ? win.matchMedia('(hover: hover) and (pointer: fine)')
      : null;

  let webgl2 = false;
  let maxTextureSize = 0;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
      webgl2 = true;
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    }
  } catch {
    webgl2 = false;
  }

  return {
    pointer: {
      coarse: nav.maxTouchPoints > 0 && !media?.matches,
      hover: media?.matches ?? true,
      pen: nav.maxTouchPoints > 1 && 'PointerEvent' in window,
      maxTouchPoints: nav.maxTouchPoints,
    },
    graphics: {
      webgl2,
      estimatedTier: maxTextureSize >= 8192 ? 'high' : maxTextureSize >= 4096 ? 'medium' : 'low',
      maxTextureSize,
    },
    storage: {
      indexedDb: typeof indexedDB !== 'undefined',
      opfs: typeof navigator.storage !== 'undefined' && 'getDirectory' in navigator.storage,
      persistentStorageGranted: false,
    },
    platform: {
      standalonePwa: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
      tauri: '__TAURI_INTERNALS__' in window,
      appleQuickLook: nav.userAgent.includes('iPhone') || nav.userAgent.includes('iPad'),
    },
  };
}
