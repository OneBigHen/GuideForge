# Phase 03 Report — Universal Web Vertical Slice

## Outcome

The full responsive web product slice is implemented end to end: typed routes,
a responsive app shell with separate local-save/network-sync indicators, a
working guide library, complete task/step authoring (rich text, warnings,
tools, parts), fake AI proposal review cards that apply accepted proposals
through the command bus, offline-first execution with evidence capture, a
Workbox `InjectManifest`/`generateSW` PWA with coordinated upgrades, and
Playwright coverage on desktop, iPad, and iPhone projects — including a
production-build offline-shell test.

## Commits

- `(this commit)` feat: Phase 03 universal web vertical slice

## Delivered vertical slices

1. **Schema + domain growth**: `GuideStep`, `GuideWarning`, `GuideTool`,
   `GuidePart`, `MediaReference` in `guide-schema` (JSON Schema + types);
   commands: `setStepText`, `addWarning`, `removeWarning`, `addTool`,
   `removeTool`, `addPart`, `removePart`; reducers pure and tested.
2. **Yjs collaboration growth**: `steps` map in the working document;
   materialize/hydrate/apply keep steps, warnings, tools, parts in sync;
   undo manager scopes cover step structures.
3. **PWA**: `manifest.webmanifest`, `icon.svg`, Workbox `generateSW` service
   worker (precache + navigation fallback), coordinated registration
   (`update-ready` event + `activateUpdate` on user prompt — never silently
   replaces an open editor).
4. **Responsive shell**: capability detection (`capabilities.ts`) not UA-only;
   separate `Saved locally` and `Local only — no server connected` pills;
   phone hides desktop nav and shows Menu; update banner.
5. **Library**: create/import/list/search-ready, Run + Open actions.
6. **Authoring** (`/edit/:guideId`): task rail, step rail, instruction
   textarea, warnings (severity-colored), tools chips, parts with quantity.
7. **Fake AI proposals**: `generateFakeProposals`, Dexie-backed pending
   proposals, review cards (summary, confidence, type), accept (runs command
   with `ai-proposal-accept` origin) / reject.
8. **Execution** (`/run/:guideId`): step cards with warnings/tools/parts,
   evidence capture (photo/signature/note) stored in Dexie, progress header,
   prev/next navigation.
9. **Offline**: after first load, app shell opens without network (verified).

## Acceptance evidence

| Criterion                                        | Evidence                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Create/edit/reopen guide offline                 | unit + e2e; y-indexeddb survives restart                                        |
| iPad authoring without hover                     | iPad Playwright project; touch-target CSS; outline rail in portrait             |
| iPhone release execution + evidence offline      | iPhone Playwright project; run route captures evidence                          |
| Fake proposals accept/edit/reject via commands   | e2e vertical slice (2→1 card count); unit tests accept via command bus          |
| Update flow does not lose an open draft          | no skipWaiting without prompt; activateUpdate only from UI                      |
| Responsive + accessibility evidence              | desktop/ipad/iphone e2e; ARIA labels, regions, roles                            |
| App shell opens without network after first load | offline e2e (Chromium; WebKit driver cannot navigate offline — documented skip) |

## Test results

- `pnpm check`: 45/45 tasks pass.
- Unit: domain 6, guide-schema 6, ui 2, desktop 2, commands 4, package 8,
  storage-web 5, collaboration 4, web 8 (incl. proposals) = 45.
- Playwright e2e: 13 passed, 2 skipped (WebKit offline), across
  desktop-chromium / ipad / iphone.

## Responsive/device evidence

- Desktop Chrome, iPad Pro 11, iPhone 13 projects: shell, library, editor,
  proposals, execution all verified. Phone uses execution-first layout; tablet
  collapses outline; no hover-only controls (all interactions have
  touch/keyboard equivalents).

## Accessibility evidence

- Form labels, `aria-label` on icon buttons, `role="alert"` errors, region
  landmarks for warnings/tools/parts, focus-visible, 44px touch targets,
  reduced-motion. Full WCAG 2.2 AA audit remains Phase 08.

## Security and privacy impact

- Proposals are human-reviewable and applied only through commands (no silent
  AI mutation); `ai-proposal-accept` origin distinguishes them.
- Service worker only in production; no secrets; WebCrypto-only browser code.
- Evidence stored locally in Dexie; no telemetry of document content.

## Persisted schema and migration impact

- Dexie v2 (adds `evidence`, `proposals` tables). `GuideSnapshot` v1 extended
  with `steps`; migrations remain pure. Draft `.gforge` still v1.

## Context7/ADR updates

- ADR 0002 updated in practice (storage roles unchanged; proposals/evidence
  added to Dexie v2).

## Known limitations

- Offline e2e skipped on WebKit projects (Playwright WebKit cannot navigate
  while offline); verified on Chromium.
- Fake AI proposals have no real source citations yet (Phase 06 adds Docling +
  ModelGateway with citation gates).
- Media references are schema-supported but asset attach UX ships in Phase 04
  (spatial/media) and real capture in Phase 05+.

## Blocked external dependencies

- None.

## Next phase readiness

- READY. Phase 04 (spatial editor) builds on `scene-core`/`scene-react` and
  the verified offline/command core.

**Gate:** PASS
