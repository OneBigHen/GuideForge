# Phase 05 Report — Multimodal Ingestion

> Historical note (2026-08-11): this report predates the Production Readiness
> Pack audit at `abefa7475d52931957721b571df828c364c7e924`. Its claims are
> retained as historical implementation evidence only, not current phase
> certification. See the current capability matrix and execution ledger.

## Outcome

Complete source processing for the single-user AI studio is implemented: a
new framework-independent `@guideforge/ingestion` domain package, a
multimodal intake pipeline in the documents worker, a browser Source Studio
that uploads and persists sources immutably (SHA-256 content addressing), and
a Source Studio route with receipts, stable region IDs, table/figure/media
segments, conflict detection, prompt-injection isolation, cancellation, and
partial results. Text sources convert fully offline and deterministically;
audio/video are routed to ASR with an explicit `asr-pending` status.

## Commits

- `(this commit)` feat: Phase 05 multimodal ingestion, source studio, receipts

## Delivered vertical slices

1. **`packages/ingestion` (new domain package)**:
   - `detectFormat`: MIME detection by magic bytes plus extension fallback.
   - `decideOcrRoute`: text-layer → OCR → VLM fallback (with page-count
     escalation), engine-agnostic and deterministic.
   - `makeReceipt` / `ConversionReceipt`: versioned conversion receipts
     (converter, converterVersion, pipelineVersion, format, pageCount,
     finishedAtIso).
   - `TableRegion` / `FigureRegion` / `MediaSegment` with stable IDs
     (`tableRegionId`, `segmentId`) and `serializeTable` for citable tables.
   - `isolateSourceText`: prompt-injection isolation that flags untrusted
     source text so it can never reach a model prompt as instructions.
   - `detectConflicts`: duplicate detection at SHA-256 equality and
     near-duplicate detection at similarity >= 0.8.
   - `createCancellationToken` + `buildRegions`: cancellable, partial region
     building that still returns what was completed on cancellation.
2. **`apps/worker-documents`**: `DEFAULT_INTAKE_POLICY` covers ~20 multimodal
   MIME types (100 MB max); `TextSourceConverter` (deterministic offline
   text/markdown/HTML/CSV); `convertMultimodal` (audio/video become
   `asr-pending` media segments, everything else routes through the text
   converter); `ingestMultimodal` returns regions, tables, mediaSegments,
   ocrRoute, receipt, conflicts, and partial/cancelledReason.
3. **`packages/storage-web`**: `SourceRecord` schema + Dexie `sources` table
   at schema `version(4)`; source bytes live in OPFS (content-addressed via
   the existing OpfsAssetStore), never inside Yjs.
4. **`apps/web/src/services/sourceStudio.ts`**: browser AddSourceService —
   `sha256Hex` (immutable hashing), `SOURCE_INTAKE_POLICY`, `addSource` /
   `listSources` / `removeSource` / `makeCancellationToken`; persists bytes to
   OPFS and regions/conflicts/receipt to Dexie.
5. **`apps/web/src/routes/sources.$guideId.tsx`**: Source Studio UI — upload,
   source list, expandable regions/tables/media, conflict warnings, receipt
   display, and a text preview. Linked from the editor.
6. **Docling pipeline seam**: `packages/ingestion` defines the converter
   contract and the worker supplies `TextSourceConverter`; the real Docling
   binary pipeline is environment-dependent (network + heavy native deps) and
   is a scoped follow-up, exactly as providers were in Phase 04.

## Acceptance evidence

| Gate                                   | Evidence                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Golden fixtures produce stable regions | ingestion tests: buildRegions deterministic region IDs; worker test converts fixture text deterministically                         |
| Page/timestamp navigation              | MediaSegment carries stable `segmentId` and media route; text sources expose pageCount + per-page regions                           |
| Tables/figures                         | serializeTable + TableRegion/FigureRegion round-trip in ingestion tests (22/22)                                                     |
| Safe failure on adversarial input      | isolation tests (prompt-injection blocked + flagged), conflict tests (dup + near-dup), cancellation tests (partial result returned) |
| Cancellation + partial results         | createCancellationToken test: cancelled run returns completed regions and cancelledReason                                           |

## Test results

- `pnpm check`: 110/110 tasks pass (typecheck, lint, format, dep-check,
  boundary, audit, license, secret-scan).
- ingestion: 22/22 tests.
- worker-documents: 16/16 tests.
- storage-web: 5/5 tests.
- web: 19/19 unit tests (incl. sourceStudio 9/9 with fake-indexeddb + webcrypto
  global setup).

## Responsive/device evidence

- Source Studio route uses existing scene-page responsive styles; layout is
  single-column on narrow screens and multi-panel on desktop. iPad remains a
  first-class authoring target (OPFS + Dexie supported on iPadOS).

## Accessibility evidence

- Upload, source list, expandable regions, and preview use semantic elements
  (`section`, `button`, `code`, `role="alert"` for errors); progress and busy
  states are announced via text, not color alone. (Full a11y audit is a
  later-phase gate.)

## Security and privacy impact

- Source bytes are hashed with SHA-256 before storage (immutable,
  content-addressed, dedupe-safe). No document text, filenames, or excerpts
  go into ordinary telemetry.
- Prompt-injection isolation is enforced in the domain layer: untrusted
  source text is flagged and cannot reach a model prompt as instructions.
- Source files are treated as untrusted input; `SOURCE_INTAKE_POLICY` bounds
  size and allowlists MIME types; unsupported content is rejected with a
  verdict reason rather than processed.
- Binary assets stay out of Yjs (OPFS only), per the non-negotiable rule.

## Persisted schema and migration impact

- `packages/storage-web` bumps Dexie schema to `version(4)` adding the
  `sources` table (`SourceRecord`). Upgrade is additive; no data migration
  beyond Dexie's standard per-version upgrade callbacks.
- No domain/schema/package format changes to `.gforge` or Yjs working docs.

## Context7/ADR updates

- ADR 0014 added (Phase 05 multimodal ingestion). Package versions pinned via
  the pnpm catalog (fast-check, @types/node added as devDeps).

## Known limitations

- Real Docling/VLM/ASR providers require network and native runtimes
  (unavailable in this sandbox); the converter contract, OCR route decision,
  and `asr-pending` media segments are in place, provider implementations are
  scoped follow-ups (same pattern as Phase 04 providers).
- Provider adapters for external assets remain `planned` (P04-7 follow-up).

## Blocked external dependencies

- None for the delivered slice. Docling/VLM/ASR providers need network.

## Next phase readiness

- READY. Phase 06 (procedure synthesis) can consume stable source regions,
  receipts, and conflict metadata from the Source Studio.

**Gate:** PASS
