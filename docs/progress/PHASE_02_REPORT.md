# Phase 02 Report — Domain, Commands, Local-First Storage, and Draft Package

## Outcome

The portable core is complete and tested: versioned schemas, domain
invariants, a typed command bus, Yjs working documents with convergence and
local-only undo, Dexie metadata, y-indexeddb persistence, content-addressed
OPFS asset storage with IndexedDB fallback, deterministic draft `.gforge`
packaging, a pure migration runner, property tests, and a minimal local guide
library (create / open / edit title / add-remove tasks / close / reload
offline / export / import). The library works in the browser and is covered by
Playwright on desktop, iPad, and iPhone projects.

## Commits

- `(this commit)` feat: Phase 02 domain, commands, local-first storage, draft package

## Delivered vertical slices

1. **guide-schema**: checked-in `GuideSnapshot.schema.json` (draft 2020-12),
   typed `GuideSnapshot`/`GuideTask`, pure migration runner
   (`migrateToCurrent`, contiguous-chain guard).
2. **domain**: value guards for `EntityId`, `ContentHash`, lifecycle states,
   command origins, release status, quaternion unit check; `SpatialTransform`,
   `AssetReference`.
3. **commands**: `GuideCommand` envelope, `CommandRegistry`, precondition
   validation, pure reducer `applyGuideCommand` for add/rename/remove task,
   reorder, add/remove step, set-title; `freshGuideState`; fast-check property
   tests over command sequences.
4. **collaboration**: Yjs mapping (`guide` map, `tasks` map, `taskOrder`
   array), `materializeSnapshot`, `hydrateWorkingGuide`,
   `applyCommandToWorkingGuide` (origin-tagged transactions), local-only
   `Y.UndoManager` (`trackedOrigins` = local-user).
5. **storage-web**: Dexie v1 schema (guides, assets, assetBlobs),
   `persistWorkingDoc` (y-indexeddb), `OpfsAssetStore` (SHA-256 content
   addressing, OPFS with IndexedDB fallback), storage health/quota +
   persistence request.
6. **package-gforge**: deterministic draft ZIP (fixed mtime, store level,
   lexicographic entries), manifest with per-entry SHA-256, path-safety
   validation (absolute/`..`/backslash/control chars/duplicates/budgets),
   Node + WebCrypto hash strategies (`createDraftPackageAsync`,
   `verifyPackageStructureAsync`).
7. **apps/web guide store**: `createGuide`, `openGuide` (empty-doc-then-seed
   so persisted state wins), `dispatchCommand`, `renameGuide`, `addTask`,
   `closeGuide` (flushed destroy), `exportDraft`, `importDraft`, `listGuides`.
8. **UI**: `/library` (create, import, list, open) and `/edit/$guideId`
   (rename, add/remove task, export) — real functionality, no placeholders.

## Acceptance evidence

| Gate | Evidence |
|---|---|
| Two independently updated local Yjs docs converge | `collaboration/src/index.test.ts` — snapshot equality after cross-sync |
| Local user undo does not undo remote-origin changes | `collaboration` test — local task undone, remote task survives |
| Draft survives browser restart offline | `guideStore.test.ts` — close → open reloads title/tasks from y-indexeddb |
| Assets survive and deduplicate | `storage-web` test — same bytes → same hash, count stays 1 |
| Repeated package export has identical hash | `package-gforge` + `determinism.test.ts` — byte-identical bytes |
| Package traversal/bomb fixtures fail safely | `package-gforge` path-safety tests + fast-check property |
| Minimal local library works | Playwright e2e `library.spec.ts` (create → navigate → edit) across 3 projects |

## Test results

- `pnpm check`: 45/45 tasks pass (format, lint, typecheck, unit tests, build).
- Unit tests: domain 6, guide-schema 6, ui 2, desktop 2, commands 4, package 8,
  storage-web 5, collaboration 4, web 5 (incl. determinism) = 42.
- Playwright e2e: 9/9 pass (desktop-chromium, ipad, iphone).
- fast-check property tests: command sequences, path safety.

## Responsive/device evidence

- Library and edit flows verified in browser on Desktop Chrome, iPad Pro 11,
  iPhone 13 via Playwright. Full responsive design system is Phase 03.

## Accessibility evidence

- Library/edit use real form controls with labels, semantic headings, `role`
  alert for errors, keyboard-operable buttons; full WCAG 2.2 AA is Phase 08.

## Security and privacy impact

- No secrets; WebCrypto-based hashing in browser, `node:crypto` only in Node
  contexts; package import validates every entry hash (tamper detection);
  traversal/bomb rejection; no document text in telemetry.
- Browser bundle no longer imports `node:crypto` (externalized-module fix).

## Persisted schema and migration impact

- Dexie v1 schema; Yjs structure stable; `GuideSnapshot` schemaVersion 1;
  pure migration runner ready for future versions; draft `.gforge` version 1.

## Context7/ADR updates

- ADR 0002 (local-first storage + draft package) added; Context7 evidence for
  Yjs, y-indexeddb, Dexie recorded.

## Known limitations

- OPFS asset path is not exercised by automated tests (jsdom has no OPFS); the
  IndexedDB fallback path is tested and the OPFS branch is code-reviewed.
- Draft package is unsigned (signing lands in Phase 07).
- Assets are referenced but not yet re-imported into the doc on `openGuide`
  (asset attachment UX is Phase 03/04).

## Blocked external dependencies

- None.

## Next phase readiness

- READY. Phase 03 (universal responsive web vertical slice, PWA, execution
  evidence, fake AI proposals) builds on the verified offline core.

**Gate:** PASS
