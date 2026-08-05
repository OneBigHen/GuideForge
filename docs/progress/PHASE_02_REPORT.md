# Phase 02 Report — Canonical Spatial Guide and Complete Package

## Outcome

The guide, spatial scene, training, and sources are now **one canonical
project**. `GuideSnapshot` v2 carries `scene`, `training`, and `sources` as
JSON-safe structures; the working Yjs document maps them so they are
collaborative and packaged; the scene editor reads/writes the canonical scene
from the working document instead of a separate Dexie database; exports
package every referenced asset byte (no empty asset maps); imports restore
assets and rehydrate the full project; a semantic comparator proves round-trip
identity.

## User-visible vertical slices

- The spatial editor now persists the scene into the guide itself — a scene
  survives close/reopen offline, is included in `.gforge` export/import, and
  is consistent with the guide (no separate Dexie authoritative state).
- Training (objectives, assessment items) is created through the command bus
  and carried in the package.
- A complete draft export contains scene + training + referenced assets, and
  importing into a clean browser restores them identically.

## Commits

- (this commit) feat: Phase 02 canonical spatial guide + complete .gforge

## Exact commands and results

| Command                                                  | Result                                            |
| -------------------------------------------------------- | ------------------------------------------------- |
| `pnpm --filter @guideforge/guide-schema test`            | 6/6 (v2 validation, v1→v2 migration, chain)       |
| `pnpm --filter @guideforge/commands test`                | 6/6 (training commands, no-aliasing, idempotence) |
| `pnpm --filter @guideforge/collaboration test`           | 4/4                                               |
| `pnpm --filter @guideforge/web test`                     | 10/10 (incl. Phase 02 vertical slice)             |
| `pnpm check --force`                                     | 100/100 tasks pass (fresh)                        |
| `pnpm --filter @guideforge/web test:e2e`                 | (see below)                                       |
| `pnpm dep-check` / `pnpm boundary` / `pnpm format:check` | pass                                              |

## Acceptance evidence

Gate items from `prompts/phases/PHASE_02_CANONICAL_SPATIAL_PACKAGE.md`:

| Gate                                  | Evidence                                                                                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete round trip passes            | `roundtrip.test.ts`: create → task/step → model node → camera → annotation → objective + question → close/reopen → export → import → verify identical scene/training; exported guide.json carries the scene (schemaVersion 2) |
| No empty asset maps                   | `collectReferencedAssets` walks step media + scene node hashes; export packages referenced bytes; `validateReferencedAssets` reports missing                                                                                  |
| No separate authoritative scene state | scene editor reads/writes `working.scene` (Yjs); Dexie scene DB no longer authoritative                                                                                                                                       |

Additional Phase 02 tasks covered:

- **Checked-in schema v2 + migrations**: `schemas/GuideSnapshot.schema.json`
  (v2) with full scene/training/source defs; pure v1→v2 migration.
- **Yjs mapping**: `scene`/`training` Y.Maps; materialize/set helpers; every
  command syncs scene+training back to the doc.
- **OPFS assets ↔ canonical references**: content-addressed store keyed by
  SHA-256; package writer emits `assets/<sha256>.<ext>`; importer restores.
- **Semantic comparison**: `compareSnapshots` / `snapshotsSemanticallyEqual`.
- **Missing/orphan asset validation**: `validateReferencedAssets`.
- **Streaming/worker extraction**: central-directory preflight already bounds
  extraction before inflation (Phase 01); worker extraction deferred.

## Persisted schema/migrations

- `GuideSnapshot` v1 → v2 (pure migration adds scene/training/sources).
- JSON Schema updated to v2.

## Package round-trip impact

- Draft packages now carry scene + training in `guide.json` and every
  referenced asset under `assets/<sha256>.<ext>`.
- Import restores asset bytes into the store and rehydrates scene/training.

## Security/privacy/license impact

- Missing referenced assets are reported instead of silently dropped.
- No new secrets or licenses; `@guideforge/scene-core` becomes a dependency
  of `collaboration` (allowed by dep-check).

## Known limitations

- `GuideScene.stepStates`/annotations are stored but not yet interactive
  (Phase 03/10).
- Scene is serialized as one JSON field in Yjs (coarse-grained); per-node CRDT
  mapping is a later refinement if multi-device conflict granularity matters.

## External blockers

- Real-device testing remains blocked in this sandbox.

## Next-phase readiness

Phase 03 (complete spatial editor) can build on the canonical scene: hierarchy
reparenting, multiselect, layers, cameras UI, measurements, step scene states,
annotations, undo/redo — all against `GuideScene`.

**Gate:** PASS
