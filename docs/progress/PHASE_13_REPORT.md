# Phase 13 Report — Device, Performance, Accessibility, and PWA

## Gate status

The Phase 13 gate is **VERIFIED NARROWLY**. The current web path has a
route-split initial shell, a project-readiness dashboard, a local job center,
downloadable full backups, explicit storage/backup state, touch-sized
controls, PWA metadata, blocking bundle budgets, and current desktop/iPad/
iPhone emulation evidence. Physical-device behavior remains an external gate.

## Delivered path

- TanStack Router Vite route splitting is enabled; the build fails if the
  spatial scene route is no longer lazy-loaded.
- `/` reads real local guides, storage health, capability state, and last-backup
  state into a project-readiness dashboard.
- `/jobs` reads the existing Dexie photo-to-3D queue and exposes honest local
  stage/provider/GPU/cost/error state plus pause, resume, and cancel controls.
- The library downloads the existing full `.gforge` backup path. The storage
  settings card and dashboard show the last local backup marker.
- Safe-area padding, fluid responsive grids, 44px controls including small
  controls, touch-action behavior, and Apple standalone-PWA metadata cover the
  supported web/iPad/iPhone surface. Existing reduced-motion and service-worker
  behavior remains in use.

## Evidence

| Check                  | Result                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web unit tests         | `pnpm --filter @guideforge/web test -- --pool=threads --maxWorkers=1 --fileParallelism=false`: 7 files / 25 tests passed                                                                                             |
| Web lint and types     | `pnpm --filter @guideforge/web lint`; `pnpm --filter @guideforge/web typecheck`: both passed                                                                                                                         |
| Bundle budget          | `pnpm --filter @guideforge/web build`: initial `263,489` raw / `81,659` gzip; largest scene route `1,055,257` raw / `279,089` gzip; blocking budget passed                                                           |
| Phase 13 browser flow  | `pnpm --filter @guideforge/web exec playwright test e2e/phase13.spec.ts --workers=1`: 7 passed / 2 expected profile skips across desktop Chromium, iPad, and iPhone projects                                         |
| Accessibility          | `pnpm --filter @guideforge/web exec playwright test e2e/a11y.spec.ts --workers=1`: 18/18 passed; no critical or serious Axe violations across dashboard, library, job center, settings, editor, and procedure player |
| Security policy        | `bash scripts/secret-scan.sh`: fallback scan passed; gitleaks is unavailable on this host                                                                                                                            |
| Forced repository gate | `pnpm exec turbo run check --force --concurrency=1`: 125/125 tasks passed in 10m2.929s; the gate includes web and desktop builds with the bundle budget                                                              |

## Known boundary

The Playwright iPad/iPhone projects are emulations. This phase does not claim
physical Safari rendering, Apple Pencil input, external keyboard behavior,
Stage Manager/Split View on an actual iPad, physical camera capture, installed
PWA lifecycle, production CSP/headers, or native Tauri packaging. Those are
recorded as open Phase 14+ acceptance items rather than inferred from a green
browser run. The 3D route still produces the normal Vite advisory for a chunk
over 500 kB; the Phase 13 blocking budget is the measured initial gzip and
largest-route raw limits above.

**Gate:** VERIFIED NARROWLY — automated web, responsive-emulation,
accessibility, backup-download, and bundle-budget evidence passes; physical
device and production-deploy evidence remains unverified.
