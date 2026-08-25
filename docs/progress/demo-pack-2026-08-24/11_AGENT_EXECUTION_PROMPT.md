# Goal Prompt — Execute the GuideForge Public Demo Plan

Work in `OneBigHen/GuideForge`.

Read this entire pack before editing code, especially:

- `00_README_FIRST.md`
- `01_CURRENT_STATE_AND_FINDINGS.md`
- `02_TARGET_ARCHITECTURE_AND_THREAT_MODEL.md`
- phases 1–7
- `10_ADVERSARIAL_REVIEW.md`
- `12_ACCEPTANCE_MATRIX.md`

## Goal

Transform GuideForge into a real, ready-to-share demo at `https://guides.henning.rodeo`.

A fresh anonymous visitor must be able to launch a deterministic `Get to Know Andrew (Demo)` guide, see seeded procedural assets, run the guide/training experience, and perform a tightly bounded **real OpenRouter-backed** AI demonstration.

Owner authoring, canonical guides, asset management, sources, settings, secrets, signing, and unrestricted AI must remain owner-only.

## Mandatory architecture

- Preserve single-owner product architecture.
- Public demo state is per-browser/local/ephemeral, not a public tenant database.
- Add a dedicated bounded public AI endpoint; do not make full owner APIs anonymous.
- OpenRouter key stays server-side.
- Route OpenRouter through Cloudflare AI Gateway if production credentials/configuration are available.
- Require server-verified Turnstile for anonymous AI.
- Add edge + app + spend limits + provider cap + `AI_PUBLIC_DEMO_ENABLED` kill switch.
- Do not use fail2ban as primary HTTP/LLM defense.
- Do not trust `GUIDEFORGE_OWNER_ID` as authentication.
- Do not silently fall back to `FakeModelAdapter` in real-AI mode.
- Do not weaken Companion transport security to make Docker convenient.
- Final browser origin must be HTTPS.

## Start with root cause

Reproduce the current asset-manager error at `http://192.168.1.40:1420/assets`.

The likely path is `crypto.subtle.digest()` in `packages/storage-web/src/index.ts`, which requires a secure browser context. Prove the stack trace before changing code.

Then implement a central secure-context/browser-capability diagnostic and verify the asset library on `https://guides.henning.rodeo`.

## Demo

Search once for an existing safe `Get to Know Andrew` fixture/export. If none exists, build `Get to Know Andrew (Demo)` with synthetic data.

It must use normal GuideForge schema/runtime/storage and include tasks, steps, warning/tool/verification, procedural assets, a source/citation, runtime completion, learning objective, assessment, and training.

Seed it idempotently on `/demo`.

## Real AI

Make real-vs-offline mode explicit.

When configured as real:
- failures are visible;
- fake adapter never masquerades as success;
- UI shows provider/model/receipt class;
- owner AI proposals and source synthesis work end-to-end.

For anonymous demo AI:
- Turnstile Siteverify required;
- stateless/bounded request;
- no arbitrary model/provider/system prompt/URL;
- no owner DB mutation;
- low token/cost ceiling;
- persistent/edge quota;
- global spend cap;
- kill switch.

## Deployment

Use the existing `atlas` Cloudflare Tunnel described in the repo's launch runbook. Re-validate shared host state before changing it.

Expose one origin only:

`https://guides.henning.rodeo`

Do not publicly expose API/collab/companion/database ports.

Use Cloudflare Access or equivalent real owner gate for authoring/admin paths.

Set production cookies Secure/HttpOnly and exact production CORS/Origin.

## Work method

Use small PRs/commits by phase.

For each phase:
1. write failing tests;
2. prove failure;
3. implement minimal coherent change;
4. run focused tests;
5. run repo quality gates;
6. do adversarial review;
7. commit;
8. only then advance.

Do not claim completion with skipped tests.

## Final verification

Run all repo checks plus real browser tests against `https://guides.henning.rodeo`.

Produce `docs/progress/PUBLIC_DEMO_LAUNCH_REPORT.md` with deployed SHA, CI evidence, real AI receipt sample (redacted), rate/Turnstile/budget rejection evidence, public-route evidence, known risks, and rollback.

The work is complete only when every critical requirement in `12_ACCEPTANCE_MATRIX.md` is PASS.
