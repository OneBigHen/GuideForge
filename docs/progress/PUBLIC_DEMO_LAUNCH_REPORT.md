# GuideForge Public Demo — Launch Report

Date: 2026-08-25 · Branch: `feat/public-demo` · Verdict: **code-complete,
deploy-blocked** (no critical gate waived silently; every gap is enumerated
below with its unblock path). Per pack rule, no "production ready" claim is
made.

## Source state

- **Source SHA:** `0cd7b1e` (`test(api): await async boot guard rejection in
owner credential test`) plus the documentation commit that carries this
  report. All Phase 1–6 work is committed on `feat/public-demo`
  (`b3a83ca` → `0cd7b1e`).
- **Deployed SHA:** none. Nothing was deployed from this session; live shared
  infrastructure and credentials are out of scope by mission stop-conditions.
- **Public URL (planned):** `https://guides.henning.rodeo` via the existing
  `atlas` Cloudflare Tunnel. Not live; DNS/tunnel routing untouched.
- **CI run links:** none for this branch — it has never been pushed. The last
  green CI certification for an earlier SHA is recorded in
  `docs/progress/PHASE_00_REPORT.md` (run `31492608175`). Repo-wide gates were
  executed locally instead, in one sequence, with full output retained:
  `docs/progress/evidence/phase7/GATE_SEQUENCE_LOG.txt`.

## Gate evidence (R1–R6)

One repo-wide sequence at `0cd7b1e`, no browser running, nothing else
executing:

```
format:check ✓   lint ✓ (25/25 tasks)      typecheck ✓ (25/25)
test       ✓ (43/43 tasks; api 52/52 incl. PostgreSQL-backed index.test.ts 15/15,
              web 63/63, commands/domain/schema/storage/collab/companion green)
build      ✓ (25/25; web bundle budget passed, initial 81.8 KB gzip)
boundary ✓  dep-check ✓  security:policy-test ✓  security:secret-scan ✓
security:licenses ✓
```

First gate attempt honestly failed at `pnpm test`: the DB-dependent api suite
could not reach PostgreSQL (:15432 ECONNREFUSED) and exposed a **real latent
bug** — `index.test.ts` asserted a synchronous throw from the async
`buildServer` owner-credential guard (unobservable since commit `4910314`;
masked because this suite had never run here). Fixed by awaiting the
rejection (`0cd7b1e`), a helper `guideforge-pg` Postgres 16 container was
started per repo convention (stopped again after gates), and the full
sequence was re-run green end-to-end.

## Browser test evidence

- jsdom route/interaction suites cover the demo landing flow (fresh-context
  launch seeds and navigates), AI panel states (unreachable/disabled/ready),
  and proposal acceptance through the command bus — all green in the gate run.
- Desktop/iPad/iPhone **browser** smoke and external public-path smoke are
  BLOCKED: headless-browser execution is barred by standing resource rules
  after three OOM watchdog reboots of this host. The Phase 0 Playwright rig
  (desktop/iPad/iPhone projects, workers capped) exists at
  `apps/web/playwright.config.ts` for re-run on a capable host.

## Real AI provider/model receipt sample

No real provider call was made (no key exported in this environment), so no
authentic receipt exists. For schema clarity only — synthetic values from the
test suite, NOT a live call:

```json
{
  "provider": "openrouter",
  "model": "deepseek/deepseek-v4-flash-0731",
  "inputTokens": 20,
  "outputTokens": 10,
  "providerCostUsd": 0.0001,
  "requestId": "req-1"
}
```

The server allowlists exactly this single model for anonymous calls; a
mismatching receipt is rejected with 502 before proposals are built.

## Rate-limit evidence (code/test level)

- Rolling fixed window per hashed client (`sha256(demoClientId|coarse IP)`):
  default 3 calls / 10 min; reservation happens atomically BEFORE any provider
  work and counts even if the provider later fails (anti-overspend trade-off).
  Proven in `apps/api/src/demo-ai.test.ts` (window exhaustion → 429-shaped
  rejection with remaining counts; provider mock never re-invoked).
- Durable authority: `PostgresQuotaStore` over the same database as the
  control plane, restart-survivable; covered by the now-running DB-backed api
  suite. Edge-level rate limiting (Cloudflare WAF) remains a deploy-time step.

## Turnstile evidence (test-double vs production)

- Server-side verification against the Cloudflare Siteverify HTTP contract is
  unit-tested with a mocked fetcher (`turnstile.test.ts`, 8/8): success path;
  failure + error-code passthrough; hostname mismatch where configured;
  empty/oversized tokens rejected pre-network; fails CLOSED on timeout,
  network error, malformed body, or unconfigured secret.
- Guard-order tests prove Turnstile failure blocks everything downstream
  (403 before kill switch/quota/provider).
- Production widget E2E (real site key + secret against the real edge) was
  NOT exercised — requires deployed origin + Cloudflare account.

## Spend-limit / kill-switch evidence

- Kill switch: `AI_PUBLIC_DEMO_ENABLED=false` rejects before budget
  reservation AND before the provider call (dedicated test).
- Budget: global daily cap (default $2) reserved atomically pre-provider;
  per-request input-token ceiling (3,000 estimated tokens) rejects oversized
  payloads with 413 before reservation.
- Cloudflare AI Gateway spend limits and OpenRouter account caps remain
  account-side deploy-time steps (BLOCKED rows C2/C3).

## Acceptance summary

See `docs/progress/demo-pack-2026-08-24/12_ACCEPTANCE_MATRIX.md`:
32 PASS / 15 BLOCKED / 0 FAIL. Every BLOCKED row needs exactly one of:
deployment + tunnel/DNS credentials, Cloudflare/OpenRouter account access, a
provider API key, or browser-on-host execution.

## Open known risks

1. **Undeployed surface.** None of A1/A2/R8/R9/S6/C1–C4/O3 can be true until
   the runbook's production section executes on the target host.
2. **Real-provider behavior unverified live.** Adapter wiring is proven with
   injected transports; latency/retry/rate-shape against the real OpenRouter
   edge is not.
3. **Turnstile production parity.** Verified against the documented Siteverify
   contract via test-double only.
4. **Browser smoke debt.** Three OOM reboots forced deferral of device-viewport
   browser runs; jsdom coverage is not equivalent evidence.
5. **Anonymous quota correlation is hash-based.** Coarse-IP hashing means
   shared-NAT visitors share a window; deliberate trade-off, documented.
6. **Reservation-on-provider-failure.** Failed provider calls still consume
   budget reservations (anti-overspend choice); may under-serve legitimate
   users during provider incidents.

## Rollback command / path

Nothing is deployed, so there is nothing to roll back yet. When the
production stack from `infra/docker/docker-compose.prod.yml` is ever started,
rollback is:

```bash
docker compose -f infra/docker/docker-compose.prod.yml down
# then restore the prior atlas ingress config and reload:
cloudflared tunnel --config /etc/cloudflared/atlas/config.yml ingress validate
sudo systemctl restart cloudflared   # host service name per runbook
```

Full deployment order, Access policy list, and rollback notes:
`docs/deploy/PUBLIC_LAUNCH_guides_henning_rodeo.md` (production section).

## Unblock checklist to convert BLOCKED → verified

1. Export `OPENROUTER_API_KEY` (+ optional gateway ids) and run the owner +
   anonymous real-AI smokes (AI1/AI2/AI4).
2. Execute the runbook production section: compose up, tunnel DNS route,
   Access policies, WAF/AI-Gateway/cap settings (A1/S6/C1–C4/O3).
3. Re-run the Phase 7 public-path smoke suite + device viewports on the live
   origin (A2/R7/R8) and the restart drill (P6/R9).
4. Update this report and the acceptance matrix with deployed SHA + CI links.
