# ADR 0017 — DeepSeek Source-Grounded Synthesis Gateway

**Status:** Accepted with live-provider gate unverified
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

Browser-only authoring uses a separate `offline-rules` mode backed by
`synthesis-rules-v1`. A missing or failed DeepSeek request never changes a
DeepSeek receipt into an offline receipt; the browser explicitly records and
labels the offline mode instead.

## Evidence boundary

Model-gateway, synthesis, API, and web tests cover the request contract,
multi-source citations, cache/cost/budget behavior, repair, and explicit
offline behavior. No `DEEPSEEK_API_KEY` is configured on the current host, so
live model availability and useful live proposals remain unverified.
