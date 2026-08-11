# Phase 04 Report — Real Multimodal Ingestion

**Status:** implementation complete; production gate **UNVERIFIED**

This report supersedes the historical asset-library report that previously
used the Phase 04 number. It is evidence for the Production Readiness Pack
phase `PHASE_04_REAL_MULTIMODAL_INGESTION.md`, not an inherited PASS claim.

## Delivered

- `packages/ingestion` now preserves provider locators, emits provider and
  conversion-quality receipts, supports cancellable retry jobs, and reports
  cited-region revision impact.
- `apps/worker-documents` now has a real Docling bridge with OCR and table
  structure enabled, provenance bboxes, table/figure extraction, page-image
  export, and provider receipts. The primary path fails closed when Docling is
  unavailable; it does not fall back to `FakeDoclingConverter`.
- `OpenAiCompatibleVlmProvider` is used only when the deterministic route
  escalates to `vlm-fallback`.
- `WhisperMediaConverter` uses `ffprobe`, Whisper/faster-whisper, and ffmpeg
  keyframes to produce timestamped speech and keyframe segments. Missing
  `WHISPER_MODEL` is an explicit provider error.
- Browser Source Studio keeps text/Markdown local-first. Binary, image, audio,
  and video uploads are stored as `failed` with a companion/provider receipt;
  no new completed record uses `asr-pending`.
- Source Studio region buttons expose the selected excerpt and page,
  slide/sheet, or time locator with `aria-current` citation navigation.

## Focused evidence

| Check                                                    | Result       |
| -------------------------------------------------------- | ------------ |
| `pnpm --filter @guideforge/ingestion test`               | 28/28 passed |
| `pnpm --filter @guideforge/worker-documents test`        | 18/18 passed |
| `pnpm --filter @guideforge/web test`                     | 24/24 passed |
| ingestion/worker/web/guide-schema/storage-web typechecks | passed       |
| Python Docling and Whisper bridge AST parse              | passed       |
| `git diff --check`                                       | passed       |

The tests cover locator preservation, quality failures, retry/cancel behavior,
revision impact, hard-page VLM routing, absent-ASR failure, timestamp/locator
contracts, and browser failed-state persistence. They do not substitute for a
live provider run.

## Gate decision

The Pack gate requires golden digital PDF, scanned/OCR PDF, table/figure
bboxes, Office/image inputs, real timestamped ASR/video keyframes, VLM
fallback, and quality reports. The current host has no configured
`DOCLING_PYTHON`, Whisper model/runtime, VLM endpoint, or Tesseract runtime;
the real Docling/Whisper adapters therefore fail closed in this environment.
No live golden-provider evidence is claimed, and Phase 04 remains
**UNVERIFIED**, not PASS. The implementation is ready for a companion runtime
with those providers.

## Persisted and security impact

Source region locators and quality/provider receipt fields are additive to the
legacy Dexie source record and are carried into canonical provenance. Source
bytes remain content-addressed. Provider failures are visible to the user;
there is no silent fake or pending-as-complete path.

## Next action

Run the companion golden corpus with pinned Docling, OCR, Whisper, ffmpeg, and
VLM providers; capture the actual provider versions and quality reports before
certifying this phase.
