# ADR 0011 — Canonical Project v4 and Complete Package (Phase 02)

**Status:** Accepted and re-audited 2026-08-11
**Phase:** 02 (canonical project v4)

## Context

The production re-audit found that source records were still authoritative in
Dexie, `materializeSnapshot()` emitted `sources: []`, and the persisted guide
did not have first-class claims, citations, generation receipts, durable scene
anchors, or training lessons. A package could therefore appear complete while
losing source provenance on export/import.

## Decision

1. `@guideforge/domain` owns the shared `SourceKind`, `SourceLocator`,
   `CanonicalSourceRegion`, and `CanonicalSource` types. Regions carry the
   source SHA-256, locator, structural path, content, and a SHA-256 content
   hash.
2. `GuideSnapshot` is v4. Its checked-in JSON Schema requires canonical
   sources, claims, citations, generation runs, scene anchors, training
   lessons, and step claim references. Citation records carry both
   `sourceHash` and `contentHash`.
3. The Yjs working document owns the canonical source map and source order.
   Claims, citations, and generation runs are collaborative project data in
   the document rather than Dexie-only metadata. Scene and training remain in
   the same working document.
4. The pure v1→v2→v3→v4 migration chain adds the v4 structures. Legacy Dexie
   source rows are promoted by one shared pure mapper; existing rows are an
   input to migration, not a second source of truth.
5. `openGuide()` promotes legacy source rows into Yjs when needed. Package
   import migrates and validates `guide.json`, waits for Yjs persistence
   synchronization, then hydrates the canonical document. The Phase 02
   round-trip test clears Dexie before import to prove the package carries the
   sources.
6. Scene editor conversion preserves existing durable anchors when scene
   commands write the Map-based editor state. Semantic comparison includes all
   v4 structures and is insensitive to JSON object-key order.

## Consequences

- Source provenance survives clean-profile package export/import and is
  available to later ingestion, synthesis, training, and spatial phases.
- Existing Dexie rows can be read and promoted without a destructive database
  migration; after promotion, the Yjs project is authoritative.
- v4 is a persisted-format boundary. v3 snapshots remain importable through
  the tested pure migration chain.
- Real external ingestion providers, DeepSeek generation, physical device
  behavior, and production backup/restore are later phase gates; this phase
  does not claim those capabilities.

## Verification

The implementation and evidence are recorded in
[`docs/progress/PHASE_02_REPORT.md`](../progress/PHASE_02_REPORT.md). The
implementation SHA and exact GitHub run are recorded there after CI readback.
