# ADR 0011 — Canonical Spatial Guide and Complete Package (Phase 02)

**Status:** Accepted
**Date:** 2026-08-05
**Phase:** 02 (canonical spatial guide + complete `.gforge`)

## Context

The audit found the scene authoritative in a separate Dexie database
(`guideforge-scenes`), training absent from the canonical model, and packages
exported with empty asset maps. The single-user pack requires one canonical
project: guide + spatial scene + training + sources + assets, portable as a
complete `.gforge` that round-trips with identical semantics.

## Decision

1. **GuideSnapshot v2**: the canonical snapshot now carries `scene`
   (`GuideScene`), `training` (`TrainingState`), and `sources`
   (`GuideSource[]`). All are JSON-safe (arrays, no `Map`) so they serialize
   deterministically. `isGuideSnapshot` requires them; `createEmptyScene` /
   `createEmptyTraining` provide the empty defaults.
2. **Migration v1→v2**: pure migration adds empty scene/training/sources.
   `freshGuideState` and importers build v2 snapshots. The JSON Schema
   (`schemas/GuideSnapshot.schema.json`) is updated to v2 with full scene,
   training, and source definitions.
3. **Yjs canonical scene**: the working document gains `scene` and `training`
   Y.Maps holding canonical JSON. `materializeScene`/`setWorkingScene` and
   `materializeTraining`/`setWorkingTraining` bridge snapshot ↔ doc;
   `applyCommandToWorkingGuide` syncs scene+training after every command.
   The scene page now opens a guide session and reads/writes the scene from
   the working document — **no separate authoritative Dexie DB**. Dexie is
   only a cache/index.
4. **Scene converters** (`collaboration/scene-converters.ts`): pure
   conversions between scene-core's Map-based `SceneState` (editor runtime)
   and the canonical `GuideScene`.
5. **Complete packaging**: `collectReferencedAssets` walks step media + scene
   node asset hashes and packages every referenced byte (no empty asset
   maps). `importDraft` restores packaged asset bytes into the
   content-addressed store.
6. **Semantic comparison**: `compareSnapshots`/`snapshotsSemanticallyEqual`
   compare all text, ordering, citations, scene, training, and sources —
   proving round-trip identity.
7. **Training commands**: `training/add-objective` and
   `training/add-assessment-item` flow through the command bus; the reducer
   deep-clones scene+training (no aliasing).

## Current official documentation

- Library/product: JSON Schema (2020-12 draft) — unchanged contract
- Library/product: yjs (Y.Map/Y.Array) — unchanged, catalog-pinned
- Verified date: 2026-08-05

## Alternatives

- Keep the scene in Dexie and copy into the package at export: rejected — the
  pack requires the scene to be canonical in the snapshot/Yjs, collaborative,
  and imported with the guide.
- Store scene as Map in the snapshot: rejected — must be JSON-safe for
  deterministic packaging.
- Maintain parallel training store: rejected — training is first-class
  canonical content.

## Consequences

### Data and migration

- GuideSnapshot v2 is a breaking persisted-format change; v1→v2 migration is
  pure and tested. Dexie scenes DB is no longer authoritative (existing rows
  become stale cache until overwritten by the working doc).
- Dexie `guideforge` DB unchanged (scene no longer lives there).

### Security/privacy

- Assets are content-addressed and validated; missing referenced assets are
  reported (no silent empty maps).

### Browser/device

- The scene editor works fully offline against the canonical working doc.

### Cost/performance

- JSON stringify of scene on each command is negligible at editor scale.

### Licensing

- None.

## Acceptance evidence

- `packages/guide-schema`: 6 tests (v2 validation, migration, chain).
- `packages/commands`: 6 tests (training commands, no aliasing, idempotence).
- `apps/web`: 10 tests including the Phase 02 vertical slice: create guide →
  task/step → place model → camera → annotation → objective + question →
  close/reopen → export → import → verify identical scene/training + exported
  guide.json carries the scene.
- `pnpm check --force` green; E2E passes (see Phase 02 report).

## Revisit trigger

- Scene step-states and animation intents become interactive (Phase 03/10) —
  the `GuideScene.stepStates` shape may grow.
