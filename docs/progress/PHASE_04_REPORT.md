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
| `pnpm --filter @guideforge/worker-documents test`        | 21/21 passed |
| `pnpm --filter @guideforge/web test`                     | 24/24 passed |
| ingestion/worker/web/guide-schema/storage-web typechecks | passed       |
| Python Docling and Whisper bridge AST parse              | passed       |
| `git diff --check`                                       | passed       |

The tests cover locator preservation, quality failures, retry/cancel behavior,
revision impact, hard-page VLM routing, absent-ASR failure, timestamp/locator
contracts, and browser failed-state persistence. They do not substitute for a
live provider run.

## Current runtime audit — 2026-08-12

The real-provider audit ran on the current host in a temporary environment
outside the repository. It used `docling-slim` 2.119.0, `docling-core` 2.91.0,
`docling-ibm-models` 3.14.0, RapidOCR 3.9.2, ONNX Runtime 1.28.0, CPU Torch
2.5.1, Transformers 5.15.0, faster-whisper 1.2.1, ctranslate2 4.8.1,
ffmpeg/ffprobe 5.1.9, Tesseract 5.3.0, and Poppler 22.12.0. Temporary model
caches and generated fixtures remain under `/tmp` and are not repository
inputs.

| Real input / path                       | Result                                                                                                         | Evidence                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Digital PDF, SHA-256 `7c44126f…`        | complete through `ingestMultimodal`; text-layer route; 3 citable page regions; 1 table; quality 1.0            | runtime receipt reported `docling-slim` 2.119.0 after the receipt fix |
| Embedded-image PDF, SHA-256 `7fcf6220…` | 5 OCR/text regions; quality 1.0; no figure object or page image                                                | the bridge did not satisfy the figure extraction requirement          |
| Scanned-image PDF, SHA-256 `ff056d18…`  | CPU OCR run was stopped with exit 130 after sustained paging and exhausted swap                                | no complete OCR receipt is claimed                                    |
| DOCX, SHA-256 `e4089de0…`               | 2 citable paragraphs and 1 table; quality 1.0                                                                  | real Docling bridge                                                   |
| CSV / XLSX                              | table objects returned, but 0 citable text blocks and quality 0.67 with coverage warning                       | not a golden citation pass                                            |
| PNG, SHA-256 `97c12559…`                | 1 OCR region; quality 1.0                                                                                      | real Docling bridge                                                   |
| WAV, SHA-256 `a3efa09b…`                | 2 timestamped speech regions; `ffprobe` and Whisper 1.2.1 receipts; quality 1.0                                | tiny CPU model misheard “microliters” and “aspirate”                  |
| MP4, SHA-256 `8c899cea…`                | complete through `ingestMultimodal`; 2 speech regions and 4 ffmpeg keyframes; 3 provider receipts; quality 1.0 | real `WhisperMediaConverter.asConverter()` path                       |

The local Ollama OpenAI-compatible VLM probe also ran against the existing
`qwen3-vl:2b-instruct-q4_K_M` model and returned HTTP 500 because Ollama
required 5.4 GiB while only 5.2 GiB was available to the model. No VLM
fallback pass is claimed. The local Strix wrapper remained inconclusive because
the Strix CLI was not installed or cached; the running `strix` container is a
camera-discovery service, not the required security scanner.

The hosted VLM transport was separately exercised against a rendered PNG page
through OpenRouter's `google/gemini-3.5-flash-lite` vision model. It returned
the exact safety and torque text with an `openrouter-vlm` receipt. This proves
the hosted adapter and credential boundary, but not the complete hard-page
fallback because the Docling audit fixture still emitted no page image for the
route that needs it.

The bridge now records the runtime `docling` or `docling-slim` distribution
version, and assembled conversion receipts prefer that runtime version over
the configured fallback. The worker test suite is 22/22, with worker
typecheck, lint, format, and `git diff --check` passing after this change.

## Gate decision

The Pack gate requires a golden digital PDF, scanned/OCR PDF, table/figure
bboxes, Office/image inputs, real timestamped ASR/video keyframes, VLM
fallback, and quality reports. The current audit proves useful real-provider
subpaths, but scanned OCR did not complete on this CPU host, Docling did not
emit figure objects or page images for the image fixtures, CSV/XLSX coverage
was incomplete, and the VLM model could not load. No live golden-provider
evidence is claimed, and Phase 04 remains **UNVERIFIED**, not PASS.

## Persisted and security impact

Source region locators and quality/provider receipt fields are additive to the
legacy Dexie source record and are carried into canonical provenance. Source
bytes remain content-addressed. Provider failures are visible to the user;
there is no silent fake or pending-as-complete path.

## Next action

Run the companion golden corpus on a host with enough CPU/RAM or supported
accelerators for scanned OCR, add a real hard-page VLM model, and verify figure
and page-image extraction. Capture those outputs against the legally usable
golden corpus before certifying this phase.
