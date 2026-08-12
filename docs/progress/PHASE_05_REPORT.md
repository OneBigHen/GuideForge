# Phase 05 Report — DeepSeek Source-Grounded Synthesis

## Gate status

The OpenRouter-hosted DeepSeek path is **VERIFIED NARROWLY** on the current
tree. The official DeepSeek endpoint and the full golden multi-source corpus
remain unverified. The prior Phase 05 report was historical and is not used
as proof.

## Delivered path

- `packages/synthesis` now exports `SynthesisGateway` with two explicit modes:
  `deepseek` and `offline-rules`.
- The DeepSeek semantic path uses the server-only `ModelGateway`, pinned
  OpenRouter model pricing/profile data, bounded input/output/cost budgets, a
  bounded per-process cache, usage/cost receipts, and no silent provider
  substitution.
- `GUIDEFORGE_MODEL_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, and the
  pinned `OPENROUTER_MODEL` are wired server-side. The adapter sends a full
  strict extraction schema, provider parameter requirements, attribution
  headers, and excludes reasoning traces from returned content.
- Multi-source requests require SHA-256 source hashes, unique region IDs, and
  region/source hash agreement. Model output is runtime-schema validated,
  citation-gated, unit/value grounded across cited regions, ambiguity-aware,
  and passed through the existing bounded repair path.
- `POST /api/guides/:guideId/source-synthesis` keeps DeepSeek credentials
  server-side and returns the complete plan plus a generation receipt.
- Source Studio tries the companion DeepSeek path first. When it is
  unavailable, it deliberately runs the separately labeled
  `offline-rules`/`synthesis-rules-v1` path and shows provider, mode, cache,
  and cost in the result summary. Nothing is auto-applied.
- Proposal citations now carry SHA-256 source identity and SHA-256 excerpt
  hashes; persisted proposal receipts retain the producing provider/model.

## Focused evidence

| Check                                           | Result                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@guideforge/model-gateway` tests               | 19 passed                                                                                                            |
| `@guideforge/synthesis` tests                   | 19 passed, including OpenRouter receipts, multi-source, cache, budget, repair, exception, and explicit offline tests |
| `@guideforge/api` tests                         | 19 passed without a key; 19 passed with the live OpenRouter API test                                                 |
| `@guideforge/worker-documents` tests            | 25 passed, including the OpenRouter VLM transport and PDF fallback contracts                                         |
| `@guideforge/companion` tests                   | 13 passed, including serialized GPU leases                                                                           |
| `@guideforge/web` tests                         | 32 passed                                                                                                            |
| Model/synthesis/API/worker/companion typechecks | Passed                                                                                                               |

## Provider boundary

The real source probe used one SHA-256-addressed manual region and returned a
schema-valid cited plan through `deepseek/deepseek-v4-flash-0731`: 581 input
tokens, 198 output tokens, one task, zero validation issues, and a measured
provider cost of `$0.00008212`. The live API endpoint test returned the same
`provider: openrouter` and model receipt. Offline rules remain a separately
labeled path.

The remaining boundary is the Pack golden multi-source corpus and any direct
official DeepSeek acceptance run; neither is claimed by this report.

**Gate:** VERIFIED NARROWLY — OpenRouter-hosted DeepSeek path live; golden and
official-direct provider evidence remain open
