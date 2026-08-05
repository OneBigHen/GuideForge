# ADR 0006 — AI Proposal Pipeline and Model Gateway

**Status:** Accepted
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 06

## Context

GuideForge must turn documents into cited, human-reviewable guide proposals.
Source documents are untrusted; model output must never silently edit or
publish. A provider-independent gateway must isolate OpenRouter and other
providers behind one contract with strict schema validation, citation gating,
privacy routing, and usage accounting.

## Current official documentation

Verified via registry metadata 2026-08-04:

| Technology | Exact version / ref |
|---|---|
| ds4sd/docling (container) | 2.37.0 (tesseract OCR, standard pipeline) |
| fast-check | 4.9.0 (property tests) |

OpenRouter structured outputs: `response_format: { type: 'json_schema' }`
strict mode; routing + ZDR per OpenRouter docs (adapter implemented to spec).

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
5. **ModelGateway**: ordered provider fallback; ZDR policy routes to
   privacy-safe providers (fake adapter) and never relaxes automatically;
   `FakeModelAdapter` is deterministic and used for demos/tests/offline;
   `OpenRouterAdapter` is server-side only (no browser keys);
   `DirectModelAdapter` is a seam for local models.
6. **Citation gate**: an actionable claim is invalid unless it cites ≥1 valid
   existing source region with matching page + excerpt hash. Uncited output
   is rejected.
7. **Confidence**: weighted combination of extraction quality, citation
   coverage, deterministic validation, and source ambiguity — never raw model
   self-confidence.
8. **Receipts**: every call records provider, model, attempts, tokens, cost,
   latency, policy, source hash, schema/prompt versions.

## Alternatives considered

### Alternative A — hard-code the OpenRouter call in the web app

Rejected: browser-bundle API key, no provider abstraction, no citation gate.

### Alternative B — single "smart" model for everything

Rejected: provider lock-in, no ZDR routing, no deterministic offline path.

### Alternative C — chunk by token windows only

Rejected: loses structure, harms citation quality and determinism.

## Consequences

### Positive

- Deterministic pipeline fully unit/property tested without any live model.
- Uncited output rejected; injection shapes fail safely.
- Privacy routing is explicit and never loosens automatically.
- Usage receipts are recorded per call.

### Negative

- Real Docling + live OpenRouter require environment access not available in
  this sandbox (documented blocker; contract fully covered by the fake
  converter and adapter mocks).

### Security/privacy

- No keys in browser; ZDR routing; untrusted source handling; strict schema.

### Data migration

- No new persisted schema; proposals gain `sourceHash`.

### Operations

- `pnpm check` covers all pipeline packages.

## Acceptance evidence

- Region ID determinism property test; citation gate tests; injection
  fixtures; gateway ZDR test; receipt shape test; worker pipeline tests.

## Revisit trigger

- Run the real Docling worker on a registry-enabled host and diff normalized
  blocks against the fake converter.
- Validate OpenRouter structured outputs against a live endpoint with a
  fixture corpus.
