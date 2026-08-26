# Current State and Findings

## What is already solid

GuideForge has significantly more foundation than a rough prototype:

- Browser-local guide persistence, Yjs working docs, Dexie metadata, OPFS/IndexedDB asset storage.
- A content-addressed asset library and deterministic procedural asset catalog.
- A provider-independent model gateway with structured output validation and usage receipts.
- Server-side OpenRouter support; API keys do not need to ship to the browser.
- AI proposals and source synthesis routes with request limits and per-call budgets.
- Companion owner/password/recovery flow using Argon2id.
- Companion encrypted provider-secret storage using AES-256-GCM.
- Companion session rotation, logout/revoke-all, strict SameSite cookie support, login throttling, and request throttling.
- Ed25519 signing-key storage/rotation in Companion.
- Recent release-package signing trust-store improvements.
- Existing Cloudflare Tunnel launch runbook for `guides.henning.rodeo`.
- CI scripts for formatting, lint, typecheck, tests, builds, boundaries, dependency checks, secret scan, license policy, SBOM, and release verification.

## Finding 1 — likely cause of the asset-manager “crypto” error

`packages/storage-web/src/index.ts` computes content hashes with:

```ts
crypto.subtle.digest('SHA-256', ...)
```

The asset manager calls that path when `AssetLibrary.importBytes()` or `AssetLibrary.addProcedural()` writes bytes through `OpfsAssetStore`.

Web Crypto `SubtleCrypto` is a secure-context API. Browsers generally expose it over HTTPS and secure localhost contexts, not arbitrary plain-LAN HTTP origins such as:

```text
http://192.168.1.40:1420
```

This explains the observed behavior pattern:

- localhost development may work;
- LAN HTTP can throw an opaque `crypto`, `subtle`, or `digest` failure;
- the final `https://guides.henning.rodeo` origin should satisfy the browser secure-context requirement.

**Do not “fix” this only by swapping SHA-256 implementations.** Other secure-context-sensitive browser behavior remains relevant. Make HTTPS the supported deployment environment and add a clear capability diagnostic so an unsupported LAN origin does not fail mysteriously.

Files to inspect first:

- `packages/storage-web/src/index.ts`
- `packages/storage-web/src/index.test.ts`
- `apps/web/src/services/assetLibrary.ts`
- `apps/web/src/routes/assets.tsx`

## Finding 2 — the seed asset catalog exists but is not a first-run experience

`apps/web/src/services/assetLibrary.ts` already defines `SEED_CATALOG` containing deterministic CC0 procedural equipment such as:

- pipette
- beaker
- Erlenmeyer flask
- graduated cylinder
- vials/test tubes
- tubing/gauge/valve
- filter housing/cartridge
- peristaltic pump
- workbench
- hot plate/stirrer

The asset-manager UI exposes a few procedural buttons, but the library can still start empty and there is no obvious “load the demo catalog” first-run path.

Turn this existing inventory into a deterministic, idempotent demo seed rather than inventing a separate asset subsystem.

## Finding 3 — no repository-backed “Get to Know Andrew” demo was found

The current repository search and recent commit history did not surface “Andrew.” The library page currently displays “No guides yet” on a fresh browser.

Therefore implementation must use this decision rule:

1. At execution time, search the local runtime/export folders and repo one more time for a real existing `Get to Know Andrew` guide/package.
2. If found and it is safe/non-sensitive, import it into the deterministic demo fixture.
3. If not found, create a **synthetic** `Get to Know Andrew (Demo)` fixture and label it clearly as fictional/demo content.

Do not seed private biographical information about a real person merely to make the demo look populated.

## Finding 4 — real AI exists, but the UX can hide failure

`apps/web/src/services/aiProposals.ts` tries the server first, but falls back to a deterministic `FakeModelAdapter` when the server path is unavailable.

That behavior is useful offline, but dangerous for a shareable demo: a broken real provider can look successful if the UI quietly shows fake proposals.

Production requirement:

- `real-ai` mode: provider failure is visible and **does not** silently become fake.
- `offline-demo` mode: deterministic fake/rule-based AI is allowed, clearly labeled.
- UI displays provider/model/receipt class for the latest run.

## Finding 5 — existing AI controls are useful, but not enough for anonymous public use

Current API code already has:

- AI proposal limit: 10/minute per authenticated subject + IP.
- Source synthesis limit: 6/minute per authenticated subject + IP.
- Synthesis request maximum size.
- Bounded input/output tokens.
- Per-call maximum cost (currently up to $0.25 in the viewed route).
- Audit records including provider/model/token counts/cost.

Gaps for anonymous sharing:

- in-memory buckets reset on process restart;
- no global/day spend circuit breaker in the app;
- authenticated routes are not the same problem as an anonymous demo;
- per-call `$0.25` is too permissive for an untrusted public demo;
- current route semantics assume the existing owner/session model.

## Finding 6 — do not expose the current owner session flow as public authentication

The current `apps/api` single-owner session route accepts a client-provided `userId` and compares it to configured `GUIDEFORGE_OWNER_ID`.

A UUID is an identifier, not a credential. It must not be the sole proof of ownership on a public service.

For production owner access, use one or both:

- Companion's actual password-based owner authentication, integrated safely behind the reverse proxy; and/or
- Cloudflare Access in front of owner-only paths, with origin-side validation where appropriate.

Do not rely on secrecy of `GUIDEFORGE_OWNER_ID`.

## Finding 7 — production cookie settings need an HTTPS mode

The viewed `apps/api` session cookie currently sets `secure: false`.

Before public deployment:

- production owner cookies must use `Secure`;
- keep `HttpOnly`;
- prefer `SameSite=Strict` for owner-only flows unless a documented OAuth/redirect requirement needs Lax;
- handle trusted reverse-proxy forwarding intentionally;
- add a regression test that production mode cannot issue a non-Secure owner session cookie.

## Finding 8 — current Compose publishes internal service ports

`infra/docker/docker-compose.yml` currently publishes:

- API `8080:8080`
- collab `1234:1234`
- web `1420:80`

For the public demo, the desired network shape is:

```text
Cloudflare Tunnel -> one reverse proxy/web origin -> Docker-internal services
```

API/collab/companion should normally be reachable only through the reverse proxy/Docker network, not independently exposed as public host ports.

## Finding 9 — Companion is stronger for owner secrets but not currently in Compose

Companion has good single-owner security primitives, but the current Compose stack is `postgres + api + collab + web`. Companion has no current service in that Compose file.

Do not rush by disabling Companion's “non-loopback requires TLS” rule. If Companion is added behind a reverse proxy, introduce an explicit trusted-proxy deployment mode with narrow source trust and forwarded-HTTPS validation, or use internal TLS.

## Finding 10 — fail2ban is not the primary LLM protection

Fail2ban is useful for SSH and sometimes direct-origin services. It is not a substitute for:

- Cloudflare WAF/rate limiting,
- Turnstile on anonymous expensive actions,
- application quotas,
- provider/model allowlists,
- Cloudflare AI Gateway spend limits,
- OpenRouter/provider-side caps,
- a server-side AI kill switch.

Treat fail2ban as an optional defense-in-depth host control after the edge/app controls are correct.
