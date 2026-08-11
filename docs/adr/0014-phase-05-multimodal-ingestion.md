# ADR 0014 — Multimodal Ingestion, Source Studio, and Stable Regions (Phase 05)

**Status:** Accepted
**Date:** 2026-08-06
**Phase:** 05 (multimodal ingestion)

## Context

The studio could only author from a blank page; it had no way to consume
user-provided procedure material (PDFs, DOCX, images, audio, video) as
citable, reviewable source regions. The pack requires complete source
processing — not text-only PDF extraction — with stable region IDs, versioned
conversion receipts, cancellation/partial results, prompt-injection
isolation, and source conflict detection, all gated on golden fixtures
producing stable regions.

## Decision

1. **`packages/ingestion` (new domain package)**: framework-independent
   format detection (`detectFormat`, magic bytes + extension), deterministic
   OCR-route decision (`decideOcrRoute`: text-layer → OCR → VLM fallback with
   page-count escalation), versioned `ConversionReceipt`s, stable `TableRegion`
   / `FigureRegion` / `MediaSegment` IDs, `serializeTable`, prompt-injection
   isolation (`isolateSourceText`), conflict detection (`detectConflicts`:
   duplicate at SHA-256 equality, near-duplicate at similarity >= 0.8), and
   `createCancellationToken` + cancellable `buildRegions` that return partial
   results on cancellation.
2. **Engine-agnostic converter contract**: the domain defines the pipeline
   shape; `apps/worker-documents` supplies `TextSourceConverter` (deterministic
   offline text/markdown/HTML/CSV). Real Docling/VLM/ASR providers are
   environment-dependent (network + native runtimes) and remain scoped
   follow-ups, exactly as provider adapters were in Phase 04.
3. **Immutable, content-addressed source bytes**: every source is SHA-256
   hashed before storage and stored by hash in OPFS; byte equality is the
   source identity. Binary assets never live inside Yjs.
4. **Source metadata in Dexie**: `packages/storage-web` adds a `sources`
   table (`SourceRecord`) at schema `version(4)` holding regions, tables,
   media segments, receipt, and conflict metadata keyed by guideId + sha256.
5. **Audio/video route explicitly**: the original implementation represented
   media as an `asr-pending` `MediaSegment` while transcription was a provider
   follow-up. That placeholder behavior is retained here only as historical
   context; the current Phase 04 implementation fails closed until the real
   Whisper/ffmpeg adapter can produce citable speech evidence.
6. **Prompt-injection isolation is a domain invariant**: source text is
   flagged as untrusted before it can reach any model prompt; ingestion never
   mutates a guide directly — it only produces reviewable source artifacts.
7. **Cancellation and partial results are first-class**: the browser
   `AddSourceService` (`sourceStudio.ts`) threads a `CancellationToken`
   through ingestion; cancelled runs return completed regions plus a
   `cancelledReason` instead of failing silently.

## Consequences

- Golden fixtures now produce stable region IDs; the Source Studio shows
  regions/tables/media, receipts, and conflict warnings, and text converts
  fully offline and deterministically.
- Source ingestion is reversible at the storage layer (removeSource); no
  guide mutation occurs during ingestion.
- `pnpm check` is 110/110 with ingestion 22/22, worker-documents 16/16,
  storage-web 5/5, and web 19/19 unit tests.
- Follow-ups (unchanged by this ADR): real Docling/VLM/ASR providers and
  external asset provider adapters remain `planned` until network/native
  runtimes are available.

## Amendment — 2026-08-11

The Production Readiness Pack Phase 04 supersedes the provider follow-up
language above. Real Docling, VLM, and Whisper/ffmpeg adapters now exist in
`apps/worker-documents`; the old media placeholder is retired. The adapters
fail closed when their runtime is absent, and the current host has not yet
provided live golden-corpus evidence. Historical Phase 05 test/report claims
are not certification evidence for those providers.
