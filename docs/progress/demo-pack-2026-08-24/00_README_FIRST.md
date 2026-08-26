# GuideForge Ready-to-Share Demo Pack

**Audit basis:** `OneBigHen/GuideForge` `main` at/after merge commit `73fb55e6b5aa42508421d4f9de6072c3d6551618` (2026-08-25 UTC).

**Goal:** transform the current GuideForge build into a credible, polished, public demo at `https://guides.henning.rodeo` that proves the core product loop without exposing owner data, unrestricted LLM spend, secrets, signing keys, or administrative functions.

This pack is intentionally stricter than “make the URL work.” The launch is not complete until a fresh external browser can:

1. Open the site over HTTPS with no secure-context/crypto errors.
2. Launch a deterministic sample guide without having any prior IndexedDB state.
3. See usable seeded assets and at least one real asset attached to the demo.
4. Run the sample procedure and training experience.
5. Exercise a **real** LLM-backed feature and see that it is real, not the offline fake adapter.
6. Hit enforced anti-abuse and spend controls if it tries to exceed demo limits.
7. Never gain access to owner authoring, provider credentials, signing keys, canonical owner guides, or unrestricted AI.
8. Survive service restart with configuration, owner state, and operational controls intact.
9. Pass automated browser smoke tests on desktop, iPad-sized, and iPhone-sized viewports.

## Core architecture decision

Do **not** convert GuideForge into a public multi-tenant application for this demo.

Use three trust surfaces:

- **Public demo surface:** read-only site + a per-browser local clone of the sample guide. Anonymous visitors do not receive canonical server storage.
- **Public AI demo surface:** a narrow, stateless/bounded AI endpoint protected by Turnstile, edge limits, server limits, model allowlists, input/output caps, per-client quotas, and a hard spend kill switch.
- **Owner surface:** authoring, asset management, settings, secrets, signing keys, source synthesis, full AI, imports/exports, and canonical guide data. Protect it with real owner authentication and Cloudflare Access or an equivalent identity-aware outer gate.

This preserves GuideForge's existing single-owner direction rather than hiding a new multi-tenant product inside a demo project.

## Documents

1. `01_CURRENT_STATE_AND_FINDINGS.md` — evidence-based audit and immediate risks.
2. `02_TARGET_ARCHITECTURE_AND_THREAT_MODEL.md` — trust boundaries and security architecture.
3. `03_PHASE_1_ASSET_LIBRARY_SECURE_CONTEXT.md` — fix the crypto failure and make the asset library demonstrable.
4. `04_PHASE_2_DEMO_GUIDE_AND_FIRST_RUN.md` — seed the “Get to Know Andrew” proof guide safely.
5. `05_PHASE_3_REAL_AI_LLM.md` — make the real OpenRouter/LLM path explicit and testable.
6. `06_PHASE_4_PUBLIC_DEMO_ISOLATION.md` — public demo endpoint and local-clone isolation.
7. `07_PHASE_5_PUBLIC_DEPLOYMENT_AND_CLOUDFLARE.md` — one-origin production deployment.
8. `08_PHASE_6_ABUSE_COST_OBSERVABILITY.md` — bot, quota, spend, logging, and incident controls.
9. `09_PHASE_7_RELEASE_VERIFICATION.md` — launch gates and regression evidence.
10. `10_ADVERSARIAL_REVIEW.md` — ways this project could look “done” while still being unsafe or fake.
11. `11_AGENT_EXECUTION_PROMPT.md` — concise goal prompt for a coding agent.
12. `12_ACCEPTANCE_MATRIX.md` — binary launch criteria.
13. `production.env.example` — placeholder-only environment contract.

## Non-negotiables

- Never commit provider/API credentials.
- Never put an OpenRouter key in browser JavaScript.
- Never trust a client-supplied UUID as proof that the caller is the owner.
- Never expose Companion secret/signing routes to anonymous users.
- Never silently fall back from “real AI” to `FakeModelAdapter` while presenting the UI as real AI.
- Never call a phase complete based only on unit tests. The public HTTPS route must be exercised in a real browser.
- Never weaken the Companion non-loopback transport guard merely to make Docker easier.
- Never use fail2ban as the primary web/LLM abuse defense when traffic enters through Cloudflare.
- Never let anonymous visitors mutate the owner's canonical guides.
- Never expose host ports for API/collab/companion to the Internet merely because Docker Compose can publish them.

## Recommended implementation order

`Phase 1 asset/HTTPS` → `Phase 2 demo seed` → `Phase 3 real owner AI` → `Phase 4 anonymous demo isolation` → `Phase 5 public deployment` → `Phase 6 abuse/cost controls` → `Phase 7 external verification`

Each phase must land independently, with tests and a reviewable commit/PR.
