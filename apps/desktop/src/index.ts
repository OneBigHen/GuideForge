/**
 * Desktop entry.
 *
 * GuideForge desktop is a thin Tauri 2 wrapper: the entire product lives in
 * `apps/web` and is loaded via `frontendDist: ../web/dist` (see
 * src-tauri/tauri.conf.json). This module exists only to prove the desktop
 * shell shares the web application rather than hosting a second editor.
 */
import { isGuideSnapshot } from '@guideforge/guide-schema';

export function desktopShellInfo(): { app: string; product: string } {
  return { app: 'guideforge-desktop', product: 'guideforge-web' };
}

export { isGuideSnapshot };
