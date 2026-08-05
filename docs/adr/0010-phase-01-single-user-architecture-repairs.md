# ADR 0010 — Phase 01 Single-User Architecture Repairs

**Status:** Accepted
**Date:** 2026-08-05
**Phase:** 01 (single-user architecture and correctness repairs)

## Context

`CURRENT_REPO_AUDIT.md` documented an "enterprise-shaped" control plane that
contradicted the single-user product: body-supplied roles, random per-event
audit organization IDs, a stub approval invalidation, FNV hashes passed off as
SHA-256, adapters that dropped constructor keys, shallow model validation,
signing keys persisted in `localStorage`, and unbounded synchronous unzip.

The single-user build pack requires these to be repaired before major AI
features (Phase 01 gate).

## Current official documentation

- Library/product: @noble/hashes (SHA-256)
- Exact version: 2.2.0
- Context7 ID: /paulmillr/noble-hashes
- Primary source: https://github.com/paulmillr/noble-hashes
- Verified date: 2026-08-05
- Library/product: Fastify hooks (CSRF defense in depth via Origin checks)
- Exact version: fastify 5 (catalog)
- Primary source: https://fastify.dev/docs/latest/Reference/Hooks/

## Decision

1. **Single-owner session**: `POST /api/session` no longer accepts roles from
   the request body. The server signs the owner role (`organization-owner`)
   itself. When `ownerId` is configured (network mode), only that identity may
   open a session; otherwise (loopback/dev) the caller is the single owner.
2. **Deterministic audit context**: every audit event uses the fixed
   `SINGLE_OWNER_ORG_ID` (`00000000-0000-4000-8000-000000000001`) instead of a
   fresh random UUID per event.
3. **Real approval content-hash invalidation**: the decision route requires the
   client's `currentContentHash`; if it differs from the reviewed hash, the
   approval is refused with 409 and the guide returns to draft. A review that
   was already decided is refused (409).
4. **Real SHA-256 everywhere**: `packages/domain` now exports `sha256Hex`
   (via `@noble/hashes`), replacing FNV/padded hashes in:
   - `apps/api` (`sha256HexText`),
   - `packages/interop-ms-guide` (`hashBytes`),
   - `packages/model-gateway` (`hashExcerpt`),
   - `packages/package-gforge` release verification (`hashBytes`),
   - `apps/web` proposal source hashes.
5. **Adapter key retention**: `DeepSeekAdapter` and `OpenRouterAdapter` store
   the constructor key and use it (falling back to env only when unset). This
   fixes the API passing a key that the adapter silently dropped.
6. **Deep model-output validation**: `isExtractionOutput` now validates
   step-level fields (ids, action, string arrays, citations); the gateway
   rejects any step with zero valid citations.
7. **Proposal provenance retained**: proposals persist `citations` and a full
   provider `receipt` (Dexie v3 migration); the API returns full citations +
   receipt; the UI labels the producing provider ("DeepSeek (live)" vs
   "offline deterministic") explicitly.
8. **Signing keys out of the browser**: browsers never generate or persist a
   signing key. Personal releases are unsigned by default
   (`package-gforge` manifest `signed: false`, no signature entry) and verify
   as valid-but-untrusted; the XR viewer surfaces a trust warning. Signed
   releases belong to the companion key store / OS secure store.
9. **Bounded archive extraction**: `preflightZipArchive` parses the ZIP central
   directory (metadata only) and enforces entry count, per-entry size, total
   expanded size, and compression ratio before any inflation. Used by web
   import and release verification.
10. **CSRF + rate limits + loopback default**: cookie-authenticated mutating
    requests require an allowed `Origin`; `/api/session` and
    `/api/guides/:id/ai-proposals` are rate-limited per IP/user; the API binds
    to `127.0.0.1` by default (`GUIDEFORGE_HOST` to expose).
11. **Stale hierarchy selection fixed**: row-level visibility/lock actions pass
    explicit nodeIds instead of reading a stale `selected` closure.
12. **Draft export downloads**: the editor's "Export .gforge" button now
    produces an actual Blob download (was discarded).

## Alternatives

- Keep body roles and derive permissions from the DB membership tables:
  rejected — the product is single-user; organization/workspace/membership
  theater is removed from primary paths per the pack.
- Use WebCrypto for browser SHA-256: rejected as the only path — `@noble/hashes`
  is synchronous, audited, and works in node + browser, matching the existing
  domain dependency policy.
- Sign in the browser with an ephemeral key: rejected — any browser-held key
  is a secret in browser storage; the honest default is an unsigned personal
  release.

## Consequences

### Data and migration

- Dexie `guideforge` DB adds version 3 (proposals gain `citations` +
  `receipt`; same indexes, upgrade is additive).
- No SQL schema change in this phase; audit `organizationId` becomes a fixed
  constant (existing rows keep their old random values, new rows are stable).

### Security/privacy

- No caller can self-assign roles; network mode is owner-only.
- Signing keys can no longer be exfiltrated via `localStorage`.
- Zip bombs and path traversal are rejected before decompression.
- CSRF and rate limits harden the network companion.

### Browser/device

- Proposal cards show the real provider; personal release export is explicit
  about being unsigned.

### Cost/performance

- Preflight is metadata-only (no inflation), negligible cost.

### Licensing

- `@noble/hashes` is MIT; added to the catalog.

## Acceptance evidence

- `pnpm --filter @guideforge/api test`: 17/17 (incl. body-roles ignored, owner
  enforcement, stable audit org, approval invalidation, CSRF, rate limit).
- `pnpm --filter @guideforge/model-gateway test`: 13/13 (incl. constructor-key
  retention, zero-citation rejection, no-credential behavior).
- `pnpm --filter @guideforge/package-gforge test`: 32/32 (incl. unsigned
  release, bounded preflight, zip-bomb/path-traversal rejection).
- `pnpm --filter @guideforge/domain test`: 7/7 (incl. SHA-256 vectors).
- `pnpm --filter @guideforge/ai-contracts test`: 17/17 (deep validation).
- `pnpm --filter @guideforge/web test`: 8/8 (incl. proposal provenance).
- `pnpm check --force`: full suite green (see Phase 01 report).

## Revisit trigger

- A companion signing service is implemented (Phase 07+): signed personal
  releases become available without weakening the browser guarantee.
- WebCrypto Ed25519 support stabilizes: a non-extractable key path could
  become an option for device-local signing.
