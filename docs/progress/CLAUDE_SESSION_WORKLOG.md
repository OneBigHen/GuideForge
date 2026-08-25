# Claude Code session worklog — 2026-08-24

Working document tracking a scoped follow-up pass after GF4 (`0.14.0-rc.1`).
Source of truth for scope: `docs/progress/GF4_RELEASE_REPORT.md` "Residual
risks" section, cross-checked against current code (not assumed from prior
docs). Branch: `fix/data-integrity-security-hygiene` off `main`.

## Corrected assumption

- **PLAN_TONIGHT.md Phase 0.3 (remove committed planning-pack zips) does not
  apply.** All three packs (`GuideForge_Single_User_AI_Build_Pack`,
  `GuideForge_Production_Readiness_Pack_abefa747`, `GuideForge_Universal_V2_Build_Pack.zip`)
  and their extracted dirs are already `.gitignore`d, each with an explicit
  prior commit comment ("binding instructions, not repo content", "local audit
  input, not repository content", "planning artifact, local-only"). They were
  never committed. No repo change needed; leaving them as-is matches existing,
  deliberate convention.

## In scope this session

| # | Item | Status |
|---|------|--------|
| 1 | Sources provenance-drop seam (`packages/collaboration/src/index.ts`) | **fixed** |
| 2 | Silent runtime-session reset + fake-complete guard (`guideStore.ts` / `execution-runtime.ts`) | **fixed** |
| 3 | `apps/api` organization-owner default + compose dead port | **fixed** |
| 4 | `verifyReleasePackage` signature pinning | **fixed** |

### 1. Sources provenance-drop seam

`setCanonicalSources` did a full clear-and-rewrite of the Yjs sources map on
every command, from a snapshot that `materializeSources` had already silently
filtered (any entry whose `sourceJson` failed `JSON.parse` was dropped). The
very next command — even one unrelated to sources — would permanently destroy
that entry. Fixed by having `setCanonicalSources` preserve (not delete) any
existing entry that doesn't parse and isn't in the new list, instead of
wiping it. Still omitted from the typed `GuideSnapshot.sources` array (can't
render invalid data), but no longer permanently destroyed.
Test: `packages/collaboration/src/index.test.ts` — "does not permanently
destroy an unparseable source on an unrelated command".

**Related, not fixed**: the same pattern exists for `claimsJson` /
`citationsJson` / `generationRunsJson` via `readJsonArray`/`writeJsonArray` —
see "Newly discovered" below.

### 2. Silent runtime-session reset + fake-complete guard

Two related fixes in `apps/web/src/services/guideStore.ts`:

- `loadRuntimeSession` used to silently replace an existing in-progress
  runtime session with a fresh one whenever the guide's `stepIds` changed
  (e.g. a step was added/removed), discarding the fact that real progress
  existed with zero signal to the caller. It now returns
  `{ runtime, supersededSession }` — `supersededSession` is set only when the
  replaced session had real, unresolved progress. The old session was never
  actually deleted from Dexie (a new `sessionId` is created), so nothing here
  changes persistence; it makes the fact visible. `run.$guideId.tsx` now
  shows a dismissible banner when this happens.
- The "resume an existing session" path validated the stored record against
  the Ajv shape schema (`validateRuntimeSessionSchema`) but not against
  `isRuntimeSession` from `@guideforge/guide-schema` — a stricter, already-
  written semantic guard (completions/currentStepIndex/status cross-field
  consistency) that was exported from the package but never actually called
  anywhere. A schema-valid-but-inconsistent record (e.g. `status: 'completed'`
  with no matching completions) would previously be trusted and rendered by
  the UI's `runtime.status === 'completed'` check. Now both checks run.
Tests: `apps/web/src/services/guideStore.test.ts` — "surfaces a superseded
runtime session instead of silently discarding progress", "does not resume a
schema-valid but internally inconsistent stored runtime session".

### 3. apps/api organization-owner default + compose dead port

`POST /api/session` minted the `organization-owner` role for *any* caller
whenever `GUIDEFORGE_OWNER_ID` wasn't configured (documented as "loopback/dev
mode" but never actually enforced as loopback-only in code). Added
`apps/api/src/bind-guard.ts` (`assertSafeBindConfig`), called from
`server.ts` at startup: refuses to bind to a non-loopback host unless
`GUIDEFORGE_OWNER_ID` is also set, turning the comment's stated intent into
an enforced invariant. Separately, `infra/docker/docker-compose.yml` published
`8080:8080` for the api service without ever setting `GUIDEFORGE_HOST`, so
the app bound to `127.0.0.1` *inside* the container and the published port
was actually unreachable ("dead", per GF4) — documented this and wired
`GUIDEFORGE_HOST`/`GUIDEFORGE_OWNER_ID` through as configurable env passthroughs
so an operator can deliberately enable network mode, with the new guard as
the backstop if they enable the host bind without an owner.
Test: `apps/api/src/bind-guard.test.ts` (pure function, no DB needed).
**Not run locally**: `apps/api/src/index.test.ts` needs a live Postgres on
`localhost:15432`, not available in this sandbox
(`ECONNREFUSED ::1:15432`/`127.0.0.1:15432`). Confirmed via `git stash` that
the exact same 6 assertions fail identically on the unmodified branch tip —
pre-existing environment limitation, not a regression from this change. CI
should be the first real run of the full `apps/api` DB-backed suite against
this branch.

### Full monorepo verification

`pnpm check` (format/lint/typecheck/test/build across all 25 packages): 98/99
tasks pass. The only failure is `@guideforge/api#test`, and only its
Postgres-dependent cases within it (6 of 22) — confirmed pre-existing via
`git stash` (identical failure on unmodified `main`), not caused by this
branch's changes.

### 4. verifyReleasePackage signature pinning

`verifyReleasePackage` verified the embedded signature against the public key
embedded in the same package — proves internal self-consistency only, not
authenticity (anyone can sign a forged package with their own key and embed
it alongside; `keyId` was a free-form label with no cryptographic binding to
the actual key). `packages/package-gforge/src/signing.ts` already had a fully
built, fully unit-tested `TrustedKeyStore` (add/revoke/isActive/get) that was
never wired into verification anywhere in the codebase. Added an optional
`{ trustedKeys: TrustedKeyStore }` parameter to `verifyReleasePackage`: when
provided, the embedded `keyId` must resolve to a currently-active pinned
entry AND its public key must match what's embedded, or verification fails.
Omitting the option preserves prior behavior exactly (verified via a
same-session, "no trust store" test case). `apps/xr-web/src/main.tsx` (the
one consumer that opens `.gforge` files from outside the local session) still
doesn't pass a trust store — documented why in a code comment rather than
inventing a key-distribution mechanism unprompted; wiring it needs a decision
about where the viewer gets trusted `keyId`s from, which is out of scope here.
Tests: `packages/package-gforge/src/signing.test.ts` — pinned-key trust,
untrusted-key rejection, unknown/revoked keyId rejection, backward
compatibility without a trust store.

## Newly discovered while working (not yet fixed)

- **Same provenance-drop pattern in `readJsonArray`** (`packages/collaboration/src/index.ts:383-392`),
  used for `claimsJson` / `citationsJson` / `generationRunsJson`. A malformed
  blob is silently coerced to `[]` on read; the next command write persists
  that empty array back over the corrupt-but-recoverable original, same
  permanent-loss mechanism as the sources bug. Not fixed this session — the
  sources fix (below) uses a preserve-on-write-back strategy that doesn't
  translate directly to a single-string-blob field, and this wasn't part of
  the audited GF4 finding, so it needs its own pass rather than a rushed
  bolt-on. Flagging so it isn't lost.

## Explicitly out of scope this session (unchanged from GF4/PLAN_TONIGHT)

- Training/lesson/activity/attempt domain (Phase 5) — large new feature arc.
- GPU photo-to-3D provider wiring (Phase 6, TRELLIS.2) — blocked on
  confirming a GPU host with Zac.
- Physical device testing, signed Windows/macOS builds, production deploy.
