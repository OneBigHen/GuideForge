# GuideForge Ready-to-Share Demo — Master Implementation Plan

> For agentic workers: execute task-by-task with tests first, frequent commits, and a review gate after every phase.

**Goal:** ship a safe public GuideForge proof at `guides.henning.rodeo` with working assets, a seeded interactive guide, real AI, and bounded anonymous use.

**Architecture:** retain local-first browser state and single-owner canonical state. Add a versioned local demo fixture and a stateless public AI seam. Serve one HTTPS origin through Cloudflare; keep internal services private; protect owner paths separately.

**Tech stack:** pnpm 10.33.2, Node >=22.12, React/TanStack Router/Vite, Dexie/Yjs/OPFS, Fastify, Postgres + optional Companion SQLite, OpenRouter, Cloudflare Tunnel/WAF/Turnstile/Access/AI Gateway.

## Global constraints

- No provider secret in browser bundle.
- No owner UUID as sole authentication credential.
- No silent fake-AI fallback in production real mode.
- No anonymous canonical owner writes.
- No anonymous Companion secret/signing access.
- Final app requires HTTPS.
- Public AI has server-verified Turnstile + quotas + hard spend ceiling.
- Internal API/collab/companion/database are not direct Internet services.
- Every phase has unit/integration/browser evidence.

---

## Phase 1 deliverable — asset manager trustworthy

Primary files:

```text
packages/storage-web/src/index.ts
packages/storage-web/src/index.test.ts
apps/web/src/services/browserCapabilities.ts          (new)
apps/web/src/services/browserCapabilities.test.ts     (new)
apps/web/src/services/assetLibrary.ts
apps/web/src/routes/assets.tsx
```

Test cycle:

1. Add a failing test for absent Web Crypto producing named actionable error.
2. Run focused storage/web tests and prove failure.
3. Add capability/error implementation.
4. Test secure/insecure capability branches.
5. Add `ensureSeedCatalog()` with idempotence test.
6. Add UI status + “Load demo catalog.”
7. Browser-test HTTPS asset seed/import.
8. Commit: `fix(assets): require secure context and seed demo catalog`.

Gate: final HTTPS origin can add/list assets; insecure LAN origin is explained.

---

## Phase 2 deliverable — sample guide works from zero state

Primary files:

```text
apps/web/src/demo/get-to-know-andrew.ts                (new)
apps/web/src/demo/get-to-know-andrew.test.ts           (new)
apps/web/src/routes/demo.tsx                            (new)
apps/web/src/routes/library.tsx
apps/web/src/services/guideStore.ts
```

Test cycle:

1. Write fixture validation/idempotence tests.
2. Create fixture using normal guide schema/commands/storage.
3. Attach synthetic source and procedural assets.
4. Add runtime/training coverage.
5. Add `/demo` first-run launcher.
6. Browser-test fresh context.
7. Commit: `feat(demo): add deterministic GuideForge proof guide`.

Gate: clean browser launches and completes demo.

---

## Phase 3 deliverable — real AI is honest

Primary files:

```text
apps/web/src/services/aiProposals.ts
apps/web/src/services/aiProposals.test.ts              (create if absent)
apps/api/src/index.ts
apps/api/src/index.test.ts
packages/model-gateway/src/index.ts
packages/model-gateway/src/index.test.ts
```

Test cycle:

1. Write test: real mode server failure must not invoke fake adapter.
2. Add explicit AI mode/capability response.
3. Add provider receipt UI surface.
4. Configure OpenRouter base URL for Cloudflare AI Gateway server-side.
5. Add metadata-only gateway logging header/config if adapter path supports it.
6. Test owner AI proposal and synthesis with mocked provider contract.
7. Run one production/staging real provider smoke with secrets outside git.
8. Commit: `feat(ai): make real provider mode explicit and observable`.

Gate: real provider receipt proven.

---

## Phase 4 deliverable — safe anonymous AI seam

Primary files:

```text
apps/api/src/demo-ai.ts                                (new, recommended)
apps/api/src/demo-ai.test.ts                           (new)
apps/api/src/turnstile.ts                              (new)
apps/api/src/turnstile.test.ts                         (new)
apps/web/src/services/demoAi.ts                        (new)
apps/web/src/routes/demo.tsx
```

Interfaces:

```ts
verifyTurnstile(token, remoteIp): Promise<TurnstileDecision>
validatePublicDemoRequest(value): PublicDemoAiRequest
runPublicDemoAi(request, context): Promise<PublicDemoAiResponse>
```

Test cycle:

1. Missing/invalid/replayed Turnstile fails before provider mock is called.
2. Oversized/arbitrary-model request fails.
3. Valid request reaches fixed server model.
4. Response is stateless; no owner DB write.
5. Per-client quota hits 429.
6. kill switch fails before provider call.
7. global budget fails before provider call.
8. Commit: `feat(demo-ai): add bounded anonymous real-ai proof`.

Gate: public real AI works inside hard limits only.

---

## Phase 5 deliverable — owner trust boundary fixed

Primary files depend on selected authentication path.

Minimum acceptance regardless implementation:

- owner UUID is identifier only;
- owner path requires actual credential/Access identity;
- production session cookie Secure/HttpOnly;
- exact Origin/CORS;
- owner routes fail anonymous;
- Companion secrets/signing remain owner-only.

If Companion is used, add a reviewed proxy-aware transport mode rather than turning off `assertTransportConfig`.

Commit: `fix(auth): enforce real owner credential at public boundary`.

Gate: knowing configured owner UUID is insufficient to log in.

---

## Phase 6 deliverable — hardened production compose + Cloudflare

Primary:

```text
infra/docker/docker-compose.yml
infra/docker/nginx.conf
infra/docker/.env.example
docs/deploy/PUBLIC_LAUNCH_guides_henning_rodeo.md
```

Steps:

1. Add production compose/profile.
2. Remove host publishing for backend-only ports unless explicitly needed.
3. Add exact production CORS/origin and secret-required checks.
4. Add security headers and route body limits.
5. Deploy locally; health-check.
6. Validate `atlas` tunnel config.
7. Route `guides.henning.rodeo` to one reverse proxy origin.
8. Add Access rules for owner paths.
9. Add Turnstile.
10. Add WAF rate rules.
11. Configure AI Gateway + spend limits.
12. Verify external HTTPS.
13. Commit infra changes separately from application feature PRs where practical.

Gate: public path works; backend direct paths do not.

---

## Phase 7 deliverable — operational release evidence

1. Run all root quality/security commands.
2. Run clean-browser public smoke.
3. Run owner smoke.
4. Test Turnstile rejection.
5. Test app quota.
6. Test AI Gateway/global budget behavior.
7. Test kill switch.
8. Restart services and repeat critical smoke.
9. Run mobile viewport suite.
10. Produce `docs/progress/PUBLIC_DEMO_LAUNCH_REPORT.md`.
11. Complete `12_ACCEPTANCE_MATRIX.md`.
12. Final adversarial review.

Final commit: `docs: record GuideForge public demo launch evidence`.

No “done” verdict until all critical matrix items are PASS.
