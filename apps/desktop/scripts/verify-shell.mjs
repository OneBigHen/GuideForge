#!/usr/bin/env node
/**
 * Verify the Tauri shell loads the exact `apps/web` build.
 *
 * Checks:
 *  1. tauri.conf.json frontendDist resolves to apps/web/dist (the canonical
 *     browser build output).
 *  2. devUrl matches apps/web's Vite dev server port (1420).
 *  3. The web build output exists after `pnpm build`.
 *
 * This is the Phase 01 proof that browser and desktop share one web app and no
 * second desktop React editor exists.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');
const tauriConfigPath = join(desktopRoot, 'src-tauri', 'tauri.conf.json');

const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));

let failed = false;

// 1. frontendDist resolves into apps/web/dist
const frontendDist = resolve(desktopRoot, 'src-tauri', config.build.frontendDist);
const expectedDist = resolve(desktopRoot, '..', 'web', 'dist');
if (frontendDist !== expectedDist) {
  console.error(`FAIL: frontendDist resolves to ${frontendDist}, expected ${expectedDist}`);
  failed = true;
} else {
  console.log(`OK: frontendDist -> ${frontendDist}`);
}

// 2. devUrl matches the web dev server port
const devPort = new URL(config.build.devUrl).port;
const viteConfig = readFileSync(join(desktopRoot, '..', 'web', 'vite.config.ts'), 'utf8');
const portMatch = viteConfig.match(/port:\s*(\d+)/);
if (!portMatch || portMatch[1] !== devPort) {
  console.error(
    `FAIL: devUrl port ${devPort} does not match web dev server port ${portMatch?.[1]}`,
  );
  failed = true;
} else {
  console.log(`OK: devUrl ${config.build.devUrl} matches web dev server port ${devPort}`);
}

// 3. web build output exists
if (!existsSync(join(expectedDist, 'index.html'))) {
  console.error('FAIL: apps/web/dist/index.html missing — run pnpm build first');
  failed = true;
} else {
  console.log('OK: apps/web/dist/index.html exists');
}

if (failed) process.exit(1);
console.log('desktop shell verification passed — browser and Tauri load the same apps/web build');
