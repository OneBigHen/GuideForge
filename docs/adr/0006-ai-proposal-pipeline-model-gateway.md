# ADR 0006 — AI Proposal Pipeline and Model Gateway

**Status:** Accepted (amended 2026-08-12: OpenRouter-hosted DeepSeek is the current self-hosted transport; Docling is a local Python venv)
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 06

## Context

GuideForge must turn documents into cited, human-reviewable guide proposals.
Source documents are untrusted; model output must never silently edit or
publish. A provider-independent gateway must isolate providers behind one
contract with strict schema validation, citation gating, privacy routing, and
usage accounting.

## Amendment (2026-08-05)

- **Provider switch**: the primary LLM provider is now the **DeepSeek official
  API** (`api.deepseek.com`, models `deepseek-v4-flash` / `deepseek-v4-pro`),
  replacing OpenRouter. The `DeepSeekAdapter` uses
  `response_format: { type: 'json_object' }` and enforces the strict
  `ExtractionOutput` schema + citation gate. The API key is server-side only
  (`DEEPSEEK_API_KEY` env; never in browser bundles, VITE_* values, fixtures,
  or commits). Verified live: real extraction round-trips through the gateway
  and the control-plane `/api/guides/:guideId/ai-proposals` endpoint.
- **Docling**: the recommended deployment is now a **pinned local Python venv
  with `docling` 2.118.0** (`DOCLING_PYTHON` selects the interpreter), not the
  `ds4sd/docling` container (that image does not exist on Docker Hub; the
  maintained serving image is `ai/granite-docling`). `DoclingConverter` runs
  Docling's `DocumentConverter` with OCR and table-structure disabled for
  deterministic text-layer extraction, and maps its output to
  `NormalizedBlock[]`. Verified live: text-layer PDF extraction round-trips
  into structural chunks. `FakeDoclingConverter` remains only as an offline
  dev/test fallback.
- **Web app**: proposal generation prefers the server endpoint (real DeepSeek)
  and falls back to the deterministic local gateway only when the API is
  unreachable (offline authoring).

## Current official documentation

### Current single-user deployment override (2026-08-12)

The current Compose deployment selects OpenRouter explicitly with
`GUIDEFORGE_MODEL_PROVIDER=openrouter` and keeps `OPENROUTER_API_KEY` on the
server. The semantic model remains DeepSeek and receipts preserve
`provider: openrouter`; the official DeepSeek adapter remains available by
selecting `deepseek`.

Verified via registry metadata and live calls 2026-08-04/05:

| Technology                 | Exact version / ref                      |
| -------------------------- | ---------------------------------------- |
| DeepSeek official API      | api.deepseek.com (v4-flash, v4-pro live) |
| docling (PyPI, venv)       | 2.118.0 (no-OCR, no-table deterministic) |
| fast-check                 | 4.9.0 (property tests)                   |
| ai/granite-docling (image) | latest (IBM-maintained serving image)    |

## Decision

1. **Trust model**: AI proposes; never applies directly. Proposals are only
   applied through the command bus after human acceptance (Phase 03 gate).
2. **Intake**: strict policy (type/size/pages/encryption/malware); immutable
   SHA-256; stable region IDs = FNV-1a over `sourceHash:page:structuralPath`
   (deterministic, no randomness).
3. **Chunking**: structural (heading/paragraph/list/warning/table/figure),
   never arbitrary token windows.
4. **Extraction contract**: strict `ExtractionOutput` JSON Schema; model
   output must validate before any proposal is created.
5. **ModelGateway**: ordered provider fallback; `DeepSeekAdapter` is the
   primary real provider (server-side key); `OpenRouterAdapter` remains
   available for self-hosted deployments that prefer it;
   `DirectModelAdapter` is a seam for local models; ZDR policy routes to
   privacy-safe providers and never relaxes automatically.
6. **Citation gate**: an actionable claim is invalid unless it cites ≥1 valid
   existing source region with matching page + excerpt hash. Uncited output
   is rejected.
7. **Confidence**: weighted combination of extraction quality, citation
   coverage, deterministic validation, and source ambiguity — never raw model
   self-confidence.
8. **Receipts**: every call records provider, model, attempts, tokens, cost,
   latency, policy, source hash, schema/prompt versions.

## Alternatives considered

### Alternative A — hard-code the model call in the web app

Rejected: browser-bundle API key, no provider abstraction, no citation gate.

### Alternative B — single "smart" model for everything

Rejected: provider lock-in, no ZDR routing, no deterministic offline path.

### Alternative C — chunk by token windows only

Rejected: loses structure, harms citation quality and determinism.

### Alternative D — OpenRouter as the only provider

Superseded: DeepSeek is now primary (verified live); OpenRouter kept as an
optional server-side adapter for deployments that require it.

## Consequences

### Positive

- Deterministic pipeline fully unit/property tested; live verified with real
  DeepSeek and real Docling.
- Uncited output rejected; injection shapes fail safely.
- Privacy routing is explicit and never loosens automatically.
- Usage receipts recorded per call; the control plane records AI usage in the
  append-only audit log.

### Negative

- Real providers require environment access (API key; Docling Python venv);
  offline paths fall back to deterministic fakes with the same contracts.

### Security/privacy

- No keys in browser; ZDR routing; untrusted source handling; strict schema.

### Data migration

- No new persisted schema; proposals gain `sourceHash`; audit gains AI usage.

### Operations

- `pnpm check` covers all pipeline packages; live tests are env-gated and skip
  when the key/venv is absent.

## Acceptance evidence

- Live DeepSeek extraction through the gateway and API endpoint.
- Live Docling PDF text-layer extraction into structural chunks.
- Region ID determinism property test; citation gate tests; injection
  fixtures; gateway ZDR test; receipt shape test; worker pipeline tests.

## Revisit trigger

- Add a managed GPU/OCR Docling service for scanned documents.
- Switch to DeepSeek reasoning-optimized models as they become available.
