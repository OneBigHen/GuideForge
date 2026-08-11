# ADR 0016 — Real Multimodal Ingestion Providers

**Status:** Accepted with runtime gate pending
**Date:** 2026-08-11
**Phase:** 04

## Context

The existing ingestion package had useful format and citation contracts, but
the primary worker still disabled Docling OCR/table structure and represented
media as completed `asr-pending` placeholders. The Production Readiness Pack
requires real citable output and honest provider failures.

## Decision

1. Keep provider-free contracts in `packages/ingestion`; source regions carry
   the provider's exact page/slide/sheet/time locator.
2. Run the current Docling standard pipeline in `apps/worker-documents` with
   OCR and table structure enabled. Extract reading-order blocks, table rows,
   figures, bboxes, page images, and version receipts through a subprocess
   bridge. A missing Docling runtime is a failed conversion, never a fake
   success.
3. Escalate only hard OCR pages to an OpenAI-compatible VLM endpoint. The
   endpoint is configured outside the browser and its model/version is recorded
   in the receipt.
4. Run audio/video through ffprobe plus a configured Whisper/faster-whisper
   runtime. Preserve speech timestamps and extract bounded video keyframes with
   ffmpeg. A missing model is an explicit provider error.
5. Score observable coverage and provider health separately. Failed coverage or
   provider checks make the conversion non-complete; cancellation and retry
   states remain distinct.
6. Store browser-local binary uploads as failed companion-required records
   until a real worker is available. Source Studio exposes region locators and
   selected citation text rather than pretending to preview unconverted bytes.

## Consequences

- The worker is deployable with pinned provider runtimes without importing
  Node/browser dependencies into the domain packages.
- Provider receipts, quality reports, and revision-impact analysis make later
  citation invalidation visible and auditable.
- This repository's current host can run the tests and bridge syntax checks,
  but cannot certify the live-provider golden corpus until Docling, OCR/Whisper,
  ffmpeg, and VLM runtime configuration is supplied.
