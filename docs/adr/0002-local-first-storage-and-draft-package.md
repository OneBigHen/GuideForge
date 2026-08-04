# ADR 0002 — Local-First Storage Model and Draft Package

**Status:** Accepted
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 02 — Domain, Commands, Local-First Storage, and Draft Package

## Context

GuideForge must work offline in a browser, survive restarts, converge across
clients, and package guides deterministically. The legacy prototype used two
unsynchronized stores (IndexedDB + SQLite) with silent fallback; this ADR
records the replacement model and the draft package format decisions.

## Current official documentation

Verified via Context7 on 2026-08-04:

| Technology                                                     | Exact version | Source                      |
| -------------------------------------------------------------- | ------------- | --------------------------- |
| Yjs (CRDT shared types, transactions, undo manager, awareness) | 13.6.32       | Context7 `/yjs/docs`        |
| y-indexeddb (IndexedDB persistence provider)                   | 9.0.12        | Context7 `/yjs/y-indexeddb` |
| Dexie (IndexedDB wrapper, versioned schema)                    | 4.4.4         | Context7 `/websites/dexie`  |
| fflate (deterministic ZIP)                                     | 0.8.3         | npm registry                |
| fast-check (property-based tests)                              | 4.9.0         | npm registry                |
| fake-indexeddb (test harness)                                  | 6.2.5         | npm registry                |

Key Yjs facts applied:

- `doc.transact(fn, origin)` — origin stored on `transaction.origin`; used for
  undo scoping and audit.
- `Y.UndoManager(scope, { trackedOrigins })` — tracks only local user origins
  when configured; local undo does not revert remote changes.
- `new Awareness(doc)` — ephemeral presence, never persisted as content.

Dexie facts applied: `db.version(n).stores({...})` declarative schema; upgrades
are pure transformations.

## Decision

### Storage roles (no dual-write)

| Concern                                             | Store                                                     |
| --------------------------------------------------- | --------------------------------------------------------- |
| Active collaborative document                       | Yjs `Y.Doc` (map `guide`, map `tasks`, array `taskOrder`) |
| Yjs durability offline                              | `y-indexeddb` (`IndexeddbPersistence`)                    |
| Library metadata, indexes, jobs, settings, receipts | Dexie (`guides`, `assets`, `assetBlobs` tables, v1)       |
| Large content-addressed assets                      | OPFS (`assets/<sha256>.<ext>`), fallback to IndexedDB     |
| Presence/remote selection                           | Yjs Awareness (ephemeral only)                            |

- Binary assets never enter the Y.Doc; they are referenced by SHA-256.
- A single `OpenGuideSession` owns one `Y.Doc` + one `IndexeddbPersistence` +
  the shared Dexie DB; `closeGuide` awaits `provider.destroy()` so updates
  flush before reload.
- `openGuide` starts from an EMPTY doc, awaits `synced`, then seeds defaults
  only if the doc has no persisted data. This prevents CRDT last-write-wins
  from overriding a stored title with a pre-seeded empty value.

### Commands

- Every mutation is a typed `GuideCommand` (`commandId`, `commandType`,
  `actorId`, `guideId`, `origin`, `occurredAt`, `payload`).
- Pure reducers (`applyGuideCommand`) produce deterministic snapshots; the
  collaboration layer applies them inside transactions tagged with the origin
  (`guideforge:local-user` for `user` origin so `Y.UndoManager` tracks them).
- Undo is local-only: remote-origin transactions are outside `trackedOrigins`.

### Draft `.gforge` package

- Deterministic ZIP (fflate, `level: 0`, fixed mtime `2026-01-01T00:00:00Z`).
- Entries: `guide.json`, `assets/<sha256>.<ext>`, `manifest.json`, sorted
  lexicographically; manifest records per-entry SHA-256 and sizes.
- `manifest.json` is excluded from its own entry list.
- Safety: absolute paths, `..`, backslashes, empty segments, control chars,
  duplicate normalized paths, entry-count/size budgets all rejected.
- Browser path uses WebCrypto (`webSha256`) via `createDraftPackageAsync` and
  `verifyPackageStructureAsync`; Node path uses `node:crypto` (tests/workers).

## Alternatives considered

### Alternative A — keep legacy dual-store (IndexedDB + SQLite fallback)

Benefits: none new. Risks: no sync contract, silent data divergence. Rejected.

### Alternative B — store whole guide as a single mutable JSON in IndexedDB

Benefits: simple. Risks: no conflict resolution, no granular audit, whole-guide
rewrite races. Rejected; superseded by Yjs.

### Alternative C — asset bytes inside Yjs

Benefits: one store. Risks: CRDT bloat, no content addressing, memory pressure.
Rejected; binary assets are content-addressed and external.

## Consequences

### Positive

- Drafts survive browser restart offline (verified by test).
- Two independently updated documents converge (verified by test).
- Local undo never undoes remote edits (verified by test).
- Assets deduplicate by SHA-256 (verified by test).
- Repeated export is byte-identical (verified by test).
- Traversal/bomb fixtures fail safely (verified by test).

### Negative

- Yjs + y-indexeddb + Dexie + OPFS is a more complex stack than a single store.
- OPFS requires graceful fallback (implemented, tested via IndexedDB path in
  jsdom where OPFS is absent).

### Security/privacy

- Content hashes verified on both export and import; one-byte tamper fails.
- No secrets stored; no document content in telemetry.

### Browser/device

- Requires modern browsers (WebCrypto, OPFS where available). Safari/iPad PWA
  fallback to IndexedDB assets until OPFS is confirmed.

### Data migration

- Dexie schema v1; migrations are pure functions (`migrateToCurrent`).
- Draft package has `schemaVersion: 1`; future versions add pure migrations.

### Operations

- `pnpm check` covers all new packages; property tests (fast-check) guard
  command sequences and path safety.

## Acceptance evidence

- `packages/collaboration/src/index.test.ts`: convergence, local-undo isolation,
  hydrate/materialize round-trip.
- `packages/commands/src/guide-reducer.test.ts`: fast-check property tests.
- `packages/package-gforge/src/index.test.ts`: determinism, tamper detection,
  path-safety property tests.
- `packages/storage-web/src/index.test.ts`: Dexie metadata, y-indexeddb reload,
  asset dedup.
- `apps/web/src/services/guideStore.test.ts`: create → rename → close → reopen
  offline → export → import round-trip.

## Revisit trigger

- Upgrade to a structured Hocuspocus persistence backend (Phase 05) without
  changing the local Yjs schema.
- Add asset transfer (OPFS → S3) once the control plane lands.
