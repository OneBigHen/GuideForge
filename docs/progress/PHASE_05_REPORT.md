# Phase 05 Report — DeepSeek Source-Grounded Synthesis

## Gate status

Implementation evidence is complete. The production gate is **UNVERIFIED**:
the host has no `DEEPSEEK_API_KEY`, so no live DeepSeek proposal run was
possible. The prior Phase 05 report was historical and is not used as proof.

## Delivered path

- `packages/synthesis` now exports `SynthesisGateway` with two explicit modes:
  `deepseek` and `offline-rules`.
- The DeepSeek path uses the server-only `ModelGateway`, official model
  profiles, `/models` profile verification, bounded input/output/cost budgets,
  a bounded per-process cache, usage/cost receipts, and no silent provider
  substitution.
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

| Check                                       | Result                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@guideforge/model-gateway` tests           | 14 passed                                                                                                      |
| `@guideforge/synthesis` tests               | 18 passed, including DeepSeek mock, multi-source, cache, budget, repair, exception, and explicit offline tests |
| `@guideforge/api` tests                     | 18 passed, including offline source-synthesis endpoint                                                         |
| `@guideforge/web` tests                     | 24 passed                                                                                                      |
| Model/synthesis/API/web typechecks and lint | Passed; existing API warnings only                                                                             |
| DeepSeek live gate                          | Unverified — `DEEPSEEK_API_KEY` absent                                                                         |

## Provider boundary

The live acceptance claim remains intentionally open. A mocked HTTP response
proves request/response contracts, schema enforcement, citation integrity,
cache behavior, and budget refusal; it does not prove current provider
availability or useful live output. A live run with the configured key must
verify the model listing, cited multi-source procedure, receipt cost, and
budget before this phase can be marked PASS.

**Gate:** UNVERIFIED — live DeepSeek provider evidence required
