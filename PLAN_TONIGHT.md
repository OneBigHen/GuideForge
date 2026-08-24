# PLAN_TONIGHT.md — GuideForge closure run (supersedes gf-driver-prompt.txt phasing for tonight only)

Audited: 2026-08-24, HEAD `c80cb42` on `feat/single-user-ai-studio` (identical to origin, unchanged since Aug 13).

## State summary

This is NOT a rough or half-built project. 57 commits (all authored by "GuideForge Build
Agent"), phases 00–17 complete with self-audited, deliberately honest evidence in
`docs/progress/PHASE_*.md` and `docs/progress/EXECUTION_LEDGER.md`. Phase 17 already
ran a real production-cut gate and correctly refused to tag 1.0, citing specific,
real, still-open blockers — this project already knows what's wrong with it. Treat
`CURRENT_CODE_FINDINGS.md` and the Phase 17 report as ground truth; this plan just
sequences fixing what they already found.

An existing autonomous closure driver (`~/.hermes/scripts/gf-driver-prompt.txt` on
Hermes) already designed a GF1→GF4 phase pipeline (inventory → close gaps → merge to
main → release gate) using **Codex CLI as primary implementer** (`codex exec
--full-auto` on docker-dev, model gpt-5.6-luna) with **OpenCode as fallback only**,
and **deepseek-v4-pro adversarial "grilling"** as the review gate between phases. It
got through GF1 (inventory, grilled OK) and has sat idle at `PHASE=GF1` since Aug 13
— it was never told to advance to GF2. This plan is a concrete GF2 gap-closure list,
meant to slot into that existing pipeline, not replace it.

## OPEN DECISIONS — RESOLVED 2026-08-24

1. **Implementer**: RESOLVED — override to **OpenCode + ox-alpha as primary**,
   consistent with Switchback and PrintBrain tonight. Fallback chain becomes
   OpenCode(ox-alpha) → OpenCode(other free model) → Codex, not the reverse. The
   existing Codex-primary/deepseek-grill driver is superseded for tonight's run.
2. **Review mechanism**: RESOLVED — switch to the **GitHub PR + `@claude` +
   CodeRabbit + GitGuardian** stack (same as Switchback/PrintBrain), not the
   deepseek-v4-pro grill process. Reasoning given: the GitHub-based stack is more
   comprehensive. `CLAUDE_CODE_OAUTH_TOKEN` secret and `.github/workflows/claude.yml`
   need to be added to this repo the same way as the other two before Phase 0 PRs go
   up (not yet done as of this edit — first action of Phase 0).
3. **Real provider credentials**: PARTIALLY RESOLVED — an OpenRouter API key already
   exists (used for the Hermes fallback chain; same key, reuse it) and should cover
   the **text/LLM side** of Phase 6 (Zac explicitly said use OpenRouter instead of
   requiring a separate `DEEPSEEK_API_KEY`) — reconfigure the provider client to hit
   OpenRouter (e.g. `z-ai/glm-5.2:free` or similar) instead of DeepSeek directly.
   The **GPU photo-to-3D mesh-generation** piece is a different capability
   (image/mesh generation, not chat completions) that OpenRouter does not solve —
   that half of Phase 6 stays blocked until Zac supplies a real provider for it.
4. **Branch promotion**: `main` is 45 commits behind `feat/single-user-ai-studio`
   and CI only watches `main`, so none of phases 06–17's work has ever had GitHub CI
   run on it. Fixing this needs either (a) retargeting CI to also run on
   `feat/single-user-ai-studio` immediately (fast, safe), and/or (b) eventually
   promoting `feat/single-user-ai-studio` to be the new `main` on GitHub once GF3
   criteria are met (existing driver already plans this as GF3 — don't do it early).
   Phase 0 below does (a) only; GF3's merge-to-main gate stays as the existing driver
   specified (full verify + review approval first).

## Phase 0 — CI and repo hygiene (do first, blocks trustworthy signal on everything else)

1. Add `feat/single-user-ai-studio` to `.github/workflows/ci.yml` trigger branches
   (`push` and `pull_request`) alongside `main`, so real work finally gets GitHub CI
   coverage. Acceptance: a no-op push/PR against the branch shows a real CI run.
2. Diagnose and fix the `pnpm/action-setup` CI failure ("self-installer exits with
   code 1") — root cause not yet identified from outside the runner; likely a
   corepack/action-version mismatch since `pnpm@10.33.2` installs and runs fine
   locally. Reproduce inside the actual failing job's log, not by guessing.
   Acceptance: `check` job on a fresh PR reaches at least the install step.
3. Remove `GuideForge_Production_Readiness_Pack_abefa747.zip`,
   `GuideForge_Single_User_AI_Build_Pack.zip`, `GuideForge_Universal_V2_Build_Pack.zip`
   and their extracted sibling directories from the repo root — these are planning
   artifacts, not product code, and don't belong committed at the root of a
   production monorepo. Preserve their content by moving to `docs/legacy/` or
   deleting if fully superseded by `docs/progress/` — confirm with existing
   `docs/legacy/` convention before deciding which. Acceptance: repo root no longer
   has committed zip files; `git log` history is untouched (don't rewrite history for
   this).
4. Land phases 1–3 below as separate PRs against `feat/single-user-ai-studio` (per
   the existing GF3 rule: no merge to `main` until full verify + review approval).

## Phase 1 — Security bug (small, high value, do early)

`packages/.../assets` licensing logic: a blank `licenseId` currently falls into the
permissive CC0-like branch. Per `CURRENT_CODE_FINDINGS.md` this must fail closed —
blank/unknown license must block embedding/redistribution, not default-allow it.
Acceptance: a test asserting blank/unknown `licenseId` is rejected for
embed/redistribute, matching the existing security test conventions in the repo.

## Phase 2 — Canonical source/citation model (correctness bug, medium)

`GuideSnapshot` v3 declares `sources`, but `packages/collaboration/src/index.ts`
materializes `sources: []` and hydration never restores them — real data-loss bug.
Additionally `GuideSource` and the Dexie `SourceRecord` disagree on status,
locators, content hashes, confidence, and tables/figures/media shape. Per the
findings doc: create one canonical source domain, derive indexes from it, move
source identity into each citation (referencing a generation run) instead of a
single proposal-level `sourceHash`, and replace the FNV-like citation hash with
SHA-256 (short display IDs may stay non-cryptographic). Acceptance: hydration
round-trip test proves sources survive; existing citation tests updated for the new
hash; `pnpm check` passes.

## Phase 3 — Execution runtime evidence (medium-large)

`run.$guideId.tsx` currently stores empty photo/signature evidence and derives
progress from `evidence.length` — not a real runtime. Per the findings doc, replace
with explicit runtime sessions, real step-completion rules, and real evidence
artifacts, consistent with the v2 runtime schema already referenced in Phase 12's
ledger entry. Acceptance: a completed run's evidence contains real artifacts, not
empty placeholders; progress is derived from step-completion state, not evidence
array length; existing Phase 12 runtime tests still pass plus new ones for this.

## Phase 4 — Companion/API de-enterprise-ification (medium, matches "gorgeous" goal directly)

Per findings doc: the API still carries Postgres/org/workspace/RBAC/room-ticket
"enterprise heritage" that contradicts `AGENTS_SINGLE_USER.md`'s single-owner
direction. Reuse the good Fastify/provider/security code, but build a simpler
single-owner companion defaulting to **SQLite** (RESOLVED 2026-08-24 — Zac
delegated this call; SQLite fits the "lean self-hosted proof-of-concept" framing
better than running/maintaining a separate Postgres service for a single-owner demo).
This is the
single highest-leverage "make it feel finished, not enterprise-bloated" change
available. Acceptance: companion runs standalone with SQLite by default, no
org/workspace/RBAC surface area left reachable in single-owner mode; existing
security tests (CSRF, OIDC PKCE, cookie auth) still pass.

## Phase 5 — Training domain (large, do only if time remains)

Types exist for objectives/modules/assessment items but there's no full
lesson/activity/attempt/remediation domain or player route. This is genuinely new
feature work, not a bug fix — size it as its own multi-session arc if picked up
tonight, don't try to force it into one bounded run.

## Phase 6 — Real provider wiring (mostly unblocked 2026-08-24 — see Open Decision 3)

Text/LLM side: wire to OpenRouter using the existing key, attempt this phase.

GPU photo-to-3D mesh generation: RESOLVED to use a self-hosted open-source model
instead of a paid provider. Recommended: **TRELLIS.2** (microsoft/TRELLIS.2, MIT
license, GLB export with PBR textures up to 4096² — best current quality/license
combo). Alternatives if it doesn't fit: **Modly** (lightningpixel/modly, desktop
app wrapping local models) or **InstantMesh** (TencentARC/InstantMesh, cleanest
topology). This docker-dev host has no GPU (`nvidia-smi` not found) — this needs a
real NVIDIA GPU host, most likely `windows-zac` (192.168.1.128), which a prior
PrintBrain audit already flagged as the probable intended GPU worker but never
confirmed as actually set up for this. **Remaining open item: confirm `windows-zac`
is available and intended for this before wiring the integration** — don't assume.
If confirmed, wire TRELLIS.2 as a local inference service the app calls, same
pattern as the text/LLM provider wiring above. If not confirmed, this half stays
marked unverified per Phase 17's own honest assessment rather than faked as done.

## Explicitly out of scope tonight

Physical device testing (iPad/iPhone/Pencil/camera), Windows/macOS signed native
builds, production deployment/hosting decision, and the actual GF3 merge-to-main —
all correctly gated by the existing driver design on real verify + review evidence
this plan doesn't shortcut.
