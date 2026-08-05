# Baseline Bundle and Performance Report — Phase 00

Audited commit: `5d9a1d29` (baseline) on branch `feat/single-user-ai-studio`
Date: 2026-08-05
Method: production build (`vite build`) + Playwright e2e timing + bundle inspection

## Bundle (apps/web, `vite build`)

| Asset                                  | Bytes     | gzip      |
| -------------------------------------- | --------- | --------- |
| `dist/assets/index-*.js` (main)        | 1,583,290 | 452.55 kB |
| `dist/assets/aiProposals-*.js` (async) | 6,834     | 2.73 kB   |
| `dist/assets/index-*.css`              | 13,324    | 2.76 kB   |
| `dist/sw.js` (service worker)          | 1,248     | —         |
| `dist/workbox-*.js`                    | 14,894    | —         |

- Vite emitted a chunk-size warning for the main bundle (>500 kB after
  minification). The main chunk is a single 1.58 MB JS file with no route-level
  code splitting.
- Source maps add ~7 MB to `dist` (not shipped by the nginx config).
- Total `dist` size: 8.5 MB including maps.

### Baseline bundle finding

The single 1.58 MB main chunk is above the 500 kB advisory. This is a known
baseline issue to address in Phase 13 (device product quality) via route-level
code splitting for the 3D/spatial editor and the sources/AI pipelines. It does
not block Phase 00.

## Runtime performance

- React Three Fiber `Canvas` runs `frameloop="demand"` (scene-react), so idle
  frames do not render continuously.
- Playwright e2e (desktop Chromium + WebKit iPad/iPhone emulation) passes at
  baseline: **37 passed / 2 skipped** (`WebKit cannot navigate offline`,
  `apps/web/e2e/offline.spec.ts:11`) — re-verified in this phase with
  `pnpm --filter @guideforge/web test:e2e` (1.3 min).

## Storage / PWA

- Service worker precaches js/css/html/woff2 ≤8 MB; `navigateFallback` excludes
  `/api/` and `/assets/`.
- Offline e2e spec verifies the shell loads without network.

## Device evidence

- Playwright projects: desktop-chromium, ipad (iPad Pro 11), iphone (iPhone 13).
- Real-device (Safari/Pencil/camera) remains an external blocker; emulation
  evidence only.

## Commands

```
pnpm install --frozen-lockfile
pnpm check --force        # 100/100 tasks pass (format, lint, typecheck, unit, build)
pnpm --filter @guideforge/web test:e2e   # desktop + iPad + iPhone emulation
```
