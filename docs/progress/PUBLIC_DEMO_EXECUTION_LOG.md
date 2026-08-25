# GuideForge Public Demo Build — Execution Log

Branch: `feat/public-demo`. Plan of record:
`docs/progress/demo-pack-2026-08-24/13_MASTER_IMPLEMENTATION_PLAN.md`.

This log is an honest record of progress, incidents, and deferrals. It is
updated at every phase boundary and after every environment incident.

## Environment incident history

### Crash #1 (pre-checkpoint)

The LXC host (8 GB RAM; ~4.5 GB already consumed at boot by unrelated
production containers) hit the OOM watchdog during Phase 1 work while headless
Chrome sessions and turbo/pnpm fan-outs ran concurrently. The host rebooted.
Uncommitted work was lost; no repo state was corrupted.

### Crash #2 (during Phase 1 continuation)

A second OOM-reboot occurred during the Phase 1 continuation run. Work
survived because it had been checkpoint-committed as `bff7b19`
(`wip(phase1)`), which became the only commit on `feat/public-demo`.

**Standing resource rules adopted after crash #2** (violations caused both
crashes):

1. One heavy process at a time; never overlap browser sessions with test or
   build runs.
2. chrome-devtools browser pages are closed immediately after each use;
   browser evidence is captured sparingly in favor of unit tests wherever the
   plan permits.
3. Per-phase verification uses focused single-package test invocations only;
   no repo-wide turbo fan-outs between phases.
4. Repo-wide quality gates run exactly once, in Phase 7, with no browser open.
5. Before any heavy command, `free -m` must show ≥1500 MB available; otherwise
   wait and recheck.
6. The Vite dev server runs only when live-app evidence is explicitly required
   and is killed immediately afterwards.
7. OOM-killed commands are retried at reduced scope, never bigger.

Note: `/tmp/gf-driver.md` did not survive crash #2 (tmpfs cleared); the mission
was reconstructed from `docs/progress/demo-pack-2026-08-24/` plus the
checkpoint commit.

### Crash #3 (during Phase 6/7 polish)

A third OOM-watchdog reboot occurred on 2026-08-25, caused by swap
saturation (the host's swap file filled alongside RAM pressure). Unlike
crash #1, **no work was lost**: every phase commit survived
(`b3a83ca` … `7ce6572`, Phases 1–6) and even the uncommitted in-flight
polish across `apps/api` and `apps/web` survived on disk. After recovery,
that working tree was diff-reviewed (result: prettier/import-order
normalization plus one real indentation repair in `turnstile.ts`), its
focused suites were re-run green (api demo-ai/turnstile/capability/
bind-guard 32/32; web demo fixture/route/aiProposals 18/18; commands
guide-reducer 11/11), and it was committed as `f5b0c83` (formatting
normalization incl. pack docs) and `6aa2258` (ignore local
`.playwright-mcp/` debris from the crashed sessions).

Standing resource rules were re-affirmed and extended in practice: repo-wide
gates are the heaviest single step of the mission and nothing else may run
concurrently with them; scope is reduced on memory pressure instead of
retrying bigger.

## Recovery verification after crash #3 (2026-08-25)

- `git fsck`-clean tree; branch tip advanced to `7ce6572` pre-crash state
  plus the two post-recovery commits above.
- Focused suites re-run sequentially post-reboot (see crash #3 numbers);
  all green.

## Recovery verification after crash #2 (2026-08-25)

- Diff-reviewed checkpoint `bff7b19`: coherent Phase 1 slice —
  `SecureContextRequiredError` (named, coded error) in `packages/storage-web`,
  central `browserCapabilities.ts` probe with actionable messaging,
  idempotent `ensureSeedCatalog()` with CC0/procedural provenance,
  `/assets` storage-status panel + "Load demo asset catalog" action, tests at
  every layer, plus Task 1.1 reproduction evidence
  (`docs/progress/evidence/phase1/`).
- Re-ran focused suites post-reboot (per rules, sequentially):
  - `@guideforge/storage-web` vitest: **15/15 passed**.
  - `@guideforge/web` vitest: **12 files / 45 tests passed** — matches the
    pre-crash record exactly.
- Checkpoint finalized (amended locally; branch has never been pushed) into
  the pack-prescribed commit message
  `fix(assets): require secure context and seed demo catalog`.

## Phase status

| Phase                               | Status                                                                                                                                    | Evidence                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Asset library / secure context  | Code complete; HTTPS E2E deferred to Phase 7 gate                                                                                         | Unit suites above + LAN-HTTP repro screenshot; Task 1.6 requires the deployed HTTPS origin, which does not exist until Phase 5–6                                           |
| 2 — Demo guide from zero state      | Complete (2026-08-25)                                                                                                                     | Focused suites: commands 11/11, storage-web 15/15, web 14 files / 56 tests; typecheck + lint clean on all touched packages                                                 |
| 3 — Real AI is honest               | Code complete (2026-08-25); live provider smoke deferred to Phase 7 (requires secrets not present in this environment)                    | model-gateway 22/22, web 17 files / 63 tests incl. new aiProposals suite, api capability tests 6/6; typecheck + lint clean on touched packages                             |
| 4 — Anonymous demo AI seam          | Code complete (2026-08-25); real-widget + quota E2E on deployed infra tracked for Phase 7                                                 | api focused suites: demo-ai 13 + turnstile 8 + capability 6 = all passing; web suite 15 files / 63 tests                                                                   |
| 5 — Owner trust boundary            | Code complete (2026-08-25); DB-backed session integration tests deferred to Phase 7 (Postgres unavailable here)                           | bind-guard suite extended; api DB-free suites 32/32; typecheck + lint clean                                                                                                |
| 6 — Production compose + Cloudflare | Config/docs complete (2026-08-25); actual deploy + external verification deferred to Phase 7 (live infra + credentials out of scope here) | `docker-compose.prod.yml` (no backend publishing, required secrets, healthchecks), `nginx.prod.conf` (CSP/HSTS, route body limits, WS upgrade), runbook production section |
| 7 — Release verification            | Complete as scoped (2026-08-25): repo gates green; live deploy/external smokes BLOCKED and recorded honestly                              | Gate log `docs/progress/evidence/phase7/GATE_SEQUENCE_LOG.txt`; `12_ACCEPTANCE_MATRIX.md` 32 PASS / 15 BLOCKED / 0 FAIL; `PUBLIC_DEMO_LAUNCH_REPORT.md`                    |

### Phase 7 notes (2026-08-25)

- **Repo-wide gate sequence ran once, green, at `0cd7b1e`**: `format:check`,
  `lint`, `typecheck`, `test`, `build`, `boundary`, `dep-check`,
  `security:policy-test`, `security:secret-scan`, `security:licenses` —
  nothing else executing, no browser open, memory checked beforehand.
  Full output: `docs/progress/evidence/phase7/GATE_SEQUENCE_LOG.txt`.
- **First attempt honestly failed at `pnpm test`.** Two stacked causes:
  (a) the environmental one — the DB-dependent api suite needs PostgreSQL on
  :15432, absent here; (b) a **real latent bug** the missing database had been
  masking since Phase 5: `index.test.ts` asserted a synchronous
  `toThrow` from the async `buildServer` owner-credential guard — an async
  function never throws synchronously, so that assertion could not pass
  anywhere. Fixed by asserting the rejection (`await expect(...).rejects
.toThrow`, commit `0cd7b1e`). A throwaway `guideforge-pg` Postgres 16
  container was started per repo convention (`PHASE_00_REPORT.md`), after
  which `index.test.ts` passes 15/15; the container was stopped immediately
  after the gate run. The full sequence was then re-run end-to-end in one
  clean pass rather than resuming from the failure point.
- **Acceptance matrix filled honestly** (`12_ACCEPTANCE_MATRIX.md`):
  32 PASS / 15 BLOCKED / 0 FAIL. Real-provider rows (AI1/AI2/AI4) are BLOCKED
  because no provider key is exported here; Turnstile rows carry an explicit
  test-double-vs-production note; deployment/account/device-dependent rows are
  BLOCKED with the exact missing prerequisite named per row.
- **Launch report written** (`PUBLIC_DEMO_LAUNCH_REPORT.md`): source SHA,
  planned URL, gate evidence, receipt schema sample clearly labeled synthetic,
  rate-limit/Turnstile/spend/kill-switch evidence at code-test level, six open
  risks, rollback path, and a four-step unblock checklist. Verdict recorded:
  code-complete, deploy-blocked; no "production ready" claim.
- Honest scope statement: external public-path smoke, Cloudflare WAF/Gateway/
  Access configuration, real-provider smokes, device browser runs, and the
  service-restart drill all remain executable only against live
  infrastructure/credentials that this environment deliberately does not
  touch (mission stop conditions). Nothing was waived silently; every gap is
  enumerated in the matrix and report.

### Phase 6 notes (2026-08-25)

- Added `infra/docker/docker-compose.prod.yml`: only `web` reaches the host
  (loopback :8787 as the atlas tunnel origin); api/collab/postgres are
  network-internal; `${VAR:?}` makes secrets mandatory; restart policies,
  persistent Postgres volume, API healthcheck; full Phase 3–5 env wiring
  (AI Gateway routing, Turnstile, kill switch, budgets, owner credential).
- Added `infra/docker/nginx.prod.conf`: HSTS/nosniff/referrer/
  permissions-policy/CSP headers tuned to the app's real needs (Turnstile
  frames/scripts, blob workers, GLB media), per-route body limits, WebSocket
  upgrade for `/collab/`, X-Forwarded-Proto https.
- Appended a production section to the existing `atlas` tunnel runbook:
  deployment order, Access path list (owner paths protected, `/demo` +
  static assets public), Turnstile/WAF/AI-Gateway steps, rollback. The
  deprecated legacy tunnel warning from the original runbook stands.
- Honest limitation: nothing was deployed and no Cloudflare/tunnel state was
  touched from this session — that requires live shared infrastructure
  access and credentials which are deliberately out of scope here. The
  Phase gate "external HTTPS works" is exercised in Phase 7's verification
  pass on the host.

### Phase 5 notes (2026-08-25)

- **Closed the critical Phase 5 gap:** previously, knowing the owner UUID was
  sufficient to mint an owner session (`POST /api/session` checked only
  `userId`). Now network mode requires `GUIDEFORGE_OWNER_PASSWORD`, compared
  timing-safely (SHA-256 digests + `timingSafeEqual`), and both halves are
  checked before answering so probing cannot learn which half failed.
- `buildServer` refuses to boot when `ownerId` is set without
  `ownerPassword`; `assertSafeBindConfig` likewise refuses non-loopback
  binding without BOTH identity and credential. Loopback dev mode unchanged.
- Session cookie: `Secure` now defaults ON when every configured CORS origin
  is HTTPS (production contract `https://guides.henning.rodeo`), overridable
  via `SESSION_COOKIE_SECURE`. HttpOnly/SameSite=lax unchanged.
- Verified unchanged invariants: roles never accepted from request bodies;
  owner routes fail anonymous (401/403 paths pre-existing and covered);
  Companion TrustedKeyStore/signing untouched.
- production.env.example updated with `GUIDEFORGE_OWNER_PASSWORD` +
  `SESSION_COOKIE_SECURE`.
- Honest limitation: the credential and Secure-cookie tests live in
  `index.test.ts`, which needs PostgreSQL (not running here, live infra
  untouchable). They execute in Phase 7 against deployment infra. All
  DB-free suites pass now.

### Phase 4 notes (2026-08-25)

- Dedicated anonymous endpoint `POST /api/demo/ai-proposals`: strict request
  shape (fixed `demoVersion`, ≤12 steps × ≤1500 chars, payload caps,
  non-string fields rejected); unknown fields such as `model`, system prompts,
  or source URLs are dropped/rejected before anything runs. No canonical
  write exists anywhere on this path.
- Server-side Turnstile Siteverify (`apps/api/src/turnstile.ts`): hostname/
  action checks where configured, safe timeout, fails CLOSED on timeout,
  network error, malformed response, or unconfigured secret; malformed tokens
  are rejected before any network call. Cloudflare test-secret support
  documented for automated runs.
- Guard order proven by tests: validation → Turnstile → kill switch →
  per-request input-token cap → quota/budget reservation → provider call.
  Every rejection path asserts the provider mock was never invoked.
- Quota: hashed client correlation (`sha256(browser id|coarse IP)`), rolling
  fixed window (default 3 calls / 10 min), global daily budget (default $2)
  enforced atomically BEFORE provider work; reservations count even if the
  provider then fails (documented anti-overspend trade-off). Durable
  `PostgresQuotaStore` (same DB as control plane, `CREATE TABLE IF NOT
EXISTS`, restart-survivable) plus an in-memory store used only in tests/dev.
  Raw ids, IPs, tokens, and prompts are never stored for quota purposes.
- Model allowlist: anonymous responses must match the single server-configured
  model; a mismatching receipt is a 502. Clients cannot name models.
- Browser side (`services/demoAi.ts`): resettable non-secret local identity;
  `/demo` shows the bounded-AI section ONLY when the server reports it enabled
  (honest offline message otherwise); results become reviewable local
  proposals applied through the normal command bus after explicit acceptance.
- Capability payload extended with `publicDemo { enabled, siteKey }` (site key
  is public by design; secret stays server-side).

### Phase 3 notes (2026-08-25)

- Explicit AI modes: `generateGatewayProposals(snapshot, { mode })` now
  requires `'real' | 'offline'`. In `real` mode any server failure (network,
  HTTP error status, provider/schema failure) throws an actionable error and
  the offline adapter is never consulted. The old silent fake fallback is
  gone.
- New `GET /api/ai/capability` returns `{ mode, provider, model:
'server-selected', available }` — capability state only; no key, URL, or
  concrete model id reaches the browser (asserted by test).
- Editor UI fetches capability once, labels the generate button
  `· real` / `· offline` with an explanatory tooltip, and surfaces real-mode
  failures as visible errors instead of unhandled rejections.
- Proposal receipts now persist and display optional provider-reported usage
  (`cacheTokens`, `providerCostUsd`) plus a visible receipt line
  (`AI: <provider> · <model> · in/out tokens · cost $ · request id`). Cost is
  shown only when the server actually reported it — never invented.
- OpenRouter can now route through Cloudflare AI Gateway: server-side config
  (`CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID/_ID`) resolves the gateway base URL;
  `OpenRouterAdapter` accepts audited extra host allowlist entries
  (`gateway.ai.cloudflare.com`), SSRF guard still rejects everything else.
- Honest limitation: the API integration suites that need PostgreSQL
  (`index.test.ts`, port 15432) could not run in this environment — the
  database is not running and live infra must not be touched under the
  mission rules. New Phase 3 coverage lives in a DB-free focused file
  (`ai-capability.test.ts`, Fastify inject only). A real OpenRouter smoke
  needs credentials that are not present here; it is tracked for Phase 7
  where the plan already requires it.

### Phase 2 notes (2026-08-25)

- Searched repo/host once more for an existing shareable "Get to Know Andrew"
  fixture before building one; none found. Built the synthetic fixture with an
  explicit fictional-framing disclaimer (no facts about a real person).
- Added a first-class `guide/add-step-media` command (payload + pure reducer +
  tests) because commands are the only sanctioned guide mutation mechanism;
  asset attachment must not bypass the command bus.
- Demo guide is built through the normal stack only: Yjs working doc via
  command bus, real ingestion pipeline (`addSource`) for the bundled
  `demo-andrew-profile.md` source, content-addressed procedural assets from
  `SEED_CATALOG`, canonical training program replace.
- All demo entity ids are fixed UUIDs and command timestamps are fixed, so the
  seeded snapshot is byte-deterministic across runs.
- Idempotence/ownership rules honored: existing local demo copy (even
  visitor-modified) is never overwritten implicitly; `resetDemoGuide()` is the
  explicit destructive path (two-step confirmation in `/demo` UI).
- `/demo` route: headline, Launch action, three proof points, local-data reset,
  no admin/settings controls. Library offers "Install demo guide" at zero
  guides. Honest AI claim: none made yet — "Real AI available" status arrives
  with Phase 3's capability surface, per the spec's "only if health is green".
- Browser evidence: launch flow covered by jsdom router test
  (`src/routes/-demo.test.tsx` asserts navigation to `/run/<demo-id>` after
  seeding). Per standing resource rules, live-browser capture is deferred to
  Phase 7's external verification instead of running headless Chrome here.
