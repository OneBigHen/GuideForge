# ADR 0017 — DeepSeek Source-Grounded Synthesis Gateway

**Status:** Accepted; OpenRouter-hosted DeepSeek path verified narrowly; golden corpus gate open
**Date:** 2026-08-11
**Phase:** 05

## Decision

DeepSeek is a server-side semantic author, not the source of truth. Source
Studio sends only validated multi-source metadata and SHA-256-addressed
excerpts to `POST /api/guides/:guideId/source-synthesis`. The gateway applies
official model profiles, bounded token/cost budgets, an in-process bounded
cache, runtime output schema validation, source-hash/region citation checks,
numeric/unit grounding, ambiguity reporting, and one bounded deterministic
repair pass before returning reviewable proposals.

The current single-user deployment may select OpenRouter as the explicit
transport with `GUIDEFORGE_MODEL_PROVIDER=openrouter`; receipts preserve
`provider: openrouter` rather than mislabeling the hosted request as the
official DeepSeek API. Browser-only authoring uses a separate `offline-rules` mode backed by
`synthesis-rules-v1`. A missing or failed DeepSeek request never changes a
DeepSeek receipt into an offline receipt; the browser explicitly records and
labels the offline mode instead.

## Evidence boundary

Model-gateway, synthesis, API, worker, and companion tests cover the request
contract, multi-source citations, cache/cost/budget behavior, repair, and
explicit offline behavior. A live OpenRouter-hosted DeepSeek source probe and
API endpoint test pass with a cited plan and usage receipt. The Pack golden
multi-source corpus and direct official DeepSeek endpoint remain unverified.
