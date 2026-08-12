# ADR 0025: Device, Performance, Accessibility, and PWA Web Path

## Status

Accepted for Phase 13.

## Decision

Keep the existing Vite/TanStack Router web shell and enable the official
TanStack Router Vite route code-splitting path with `autoCodeSplitting: true`.
The plugin remains before the React plugin. The current catalog versions are
`@tanstack/react-router` 1.170.18, `@tanstack/router-plugin` 1.168.23, and
Vite 8.2.0.

The home route is a local-readiness dashboard backed by the existing guide,
storage-health, capability, and backup seams. Photo-to-3D jobs have one local
job-center route with explicit stage, provider, GPU, cost, error, and
pause/resume/cancel state. Full backup download is exposed from the library;
the existing full-backup path records its last export locally for the home and
settings surfaces.

Use CSS and native browser behavior for the device path: fluid grids for
iPad portrait/landscape/Split View/Stage Manager widths, safe-area padding,
44px controls, touch-action hints, existing reduced-motion behavior, and the
existing capability profile. The manifest, service worker, and Apple PWA
metadata remain local build artifacts. Production headers/CSP, signing,
install/upgrade/rollback, and native-device acceptance belong to Phase 14 and
later gates.

The web build enforces two measured budgets: the initial `index-*.js` asset is
at most 100 KiB gzip, and the largest JS route chunk is at most 1,200 KiB raw.
The build also fails if the spatial scene route is no longer lazy-loaded.

## Consequences

- Initial navigation does not load the spatial editor, source studio, or
  photo-to-3D route code.
- The 3D route remains the largest browser chunk and retains Vite's advisory
  warning; its explicit budget and lazy boundary make that tradeoff visible.
- Browser emulation and Axe scans prove supported layout and accessibility
  behavior in this workspace, but do not prove physical Safari, Pencil,
  camera, keyboard, Stage Manager, or installed-PWA behavior.
