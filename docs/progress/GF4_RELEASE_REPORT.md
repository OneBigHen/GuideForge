# GF4 — Final Gate & Release Report

Date: 2026-08-24 · Driver: Hermes Kanban t_dc980eea (run 9) · Host: docker-dev
Branch merged: `feat/single-user-ai-studio` → `main` (merge commit `dcc5505`, PR #1)

## Acceptance criteria (per task)

| Criterion                     | Status | Decisive evidence                                                                                                                                                                                                                           |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gaps closed on feature branch | PROVEN | Local verify ALL_STEPS_PASS at branch tip `39f075c` (format:check, lint, typecheck, test, build, boundary, dep-check); prettier batch fixed 8 files (`5bcc48e`); nanoid high advisory patched via pnpm override 3.3.18 (`fix(deps)` commit) |
| Merged to main                | PROVEN | PR #1 MERGED 2026-08-24T14:40:56Z; PR #2 (@claude workflow) MERGED 13:23Z                                                                                                                                                                   |
| Gate passed                   | PROVEN | GitHub CI green: feature branch run 32739265509 (check + Playwright e2e), main push run 32740214385 after merge; local verify suite green on both tips                                                                                      |
| Release report                | PROVEN | This document; RC built and verified below                                                                                                                                                                                                  |

## Review gate (GF3)

Adversarial diff review vs main by opencode ox-alpha-free: **VERDICT: APPROVE**
(recorded verbatim in `docs/progress/GF3_REVIEW_OXALPHA_APPROVE.md`).
No diff-introduced blockers. Note: @claude GH Action run was cancelled by the
runner before executing; the CLI-based reviewer is the substitute evidence.

## Release candidate

- Version: **0.14.0-rc.1** — `pnpm release:prepare` PASS on main
  (release policy ✓, web build ✓, companion build ✓, license policy ✓,
  SBOM ✓, metadata ✓, verify-release-candidate ✓:
  "release candidate verified: 0.14.0-rc.1, 100 payload files, Linux .deb present").
- Artifacts: `release-artifacts/0.14.0-rc.1/` (38 MB): RELEASE_MANIFEST.json
  (sha256 per file), SHA256SUMS, build-provenance.json, licenses.json,
  sbom.xml, migration-report.json, companion dist, PWA bundle, Linux .deb
  (tauri), release-notes.md.
- Support boundary (from release-notes.md, unchanged): Linux x86_64 .deb is
  the only native artifact; Windows/macOS require external signed runners.

## Residual risks / required follow-ups (not blocking this merge)

1. MAJOR — provenance-drop seam: `materializeSources` silently drops
   unparseable source JSON; next command rewrites the Y.Map from the dropped
   snapshot, making corruption permanent (`packages/collaboration/src/index.ts:180-186,365,372-381`).
2. MAJOR — silent runtime-session reset on step mismatch + schema-valid but
   inconsistent records can render fake-complete state
   (`apps/web/src/services/guideStore.ts:809-833`; strict guard bypassed on load path).
3. MAJOR — `verifyReleasePackage` checks signatures against the key embedded
   IN the package; pin to companion-published keyIds before any external
   distribution (`packages/package-gforge/src/release.ts:247-262`,
   `apps/xr-web/src/main.tsx:92-100`). Fine for local single-user use only.
4. Inherited from main: apps/api mints organization-owner role when
   GUIDEFORGE_OWNER_ID unset; compose publishes a dead port with change-me
   defaults (`apps/api/src/index.ts:185-211`, `infra/docker/docker-compose.yml:27-50`).
5. GPU photo-to-3D mesh generation remains UNVERIFIED (no GPU host confirmed;
   TRELLIS.2 candidate documented in PLAN_TONIGHT.md). Text/LLM side routes
   through OpenRouter per resolved decision.
6. Physical device testing, signed Windows/macOS builds, and production
   deployment remain explicitly out of scope per plan ("no deploy unless docs
   define it").

## Verdict

PASS for the task as scoped: gaps closed, main merged, gates green, RC
produced with honest support boundary. No deploy performed.
