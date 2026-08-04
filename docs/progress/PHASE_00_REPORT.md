# Phase 00 Report — Repository Isolation and Evidence Inventory

## Outcome

The shipped reference application was preserved read-only, a clean independent
GuideForge repository was created, and a full evidence inventory of the legacy
codebase was produced. No product code was written in this phase.

## Discrepancy recorded (important)

The build pack identifies the reference as `OneBigHen/Guides-Studiov2` at commit
`2c85e8409b125b1d337522d41aff615aacf68723`. That repository and commit are
unreachable (both `OneBigHen/Guides-Studiov2` and `OneBigHen/Guides-Studio` return
404; the commit hash exists in no local clone or reachable remote). The only
shipped reference available is the local repository `/root/Vibe/Guides-Studio`
(live remote `gsk-tech/Guides-Studio`), HEAD `ef07a2708991a1cd1797f3e428b313b2f2570ec3`.
That shipped state was preserved as the read-only reference and audited. The
discrepancy is fully documented in `LEGACY_ORIGIN.md`.

## Commits

- `b2762c9` — chore: initialize independent GuideForge repository (AGENTS.md + LEGACY_ORIGIN.md)
- `(next)` — chore: add Phase 00 legacy audit reports

## Tasks completed

1. ✅ Verified reference repo path and remotes (`gsk-tech/Guides-Studio` live; `OneBigHen/*` 404).
2. ✅ Verified reference commit — build-pack hash unavailable; preserved actual shipped HEAD `ef07a270`.
3. ✅ Created `legacy/guides-studio-reference` branch, annotated tag `guides-studio-reference-ef07a270`, read-only worktree `~/Vibe/Guides-Studio-reference`.
4. ✅ Created new orphaned `main` branch in `~/Vibe/GuideForge` (clean git history).
5. ✅ Created private GitHub repository `OneBigHen/GuideForge` (visibility verified PRIVATE).
6. ✅ Disabled push to the reference remote (`origin` and `work` push URLs → `DISABLED`).
7. ✅ Added `LEGACY_ORIGIN.md`.
8. ✅ Installed `AGENTS.md` (hash matches pack manifest `dd9f1937…`).
9. ✅ Ran secret scan, large/generated inventory, dependency/license inventory, customer/GSK scan, database/upload/runtime scan.
10. ✅ Inspected package manifests, routes, domain types, parser/exporter, storage layers, backend/auth, scene editor, AR/XR components, tests, and CI.
11. ✅ Produced `docs/progress/PHASE_00_REPORT.md`, `docs/legacy/BEHAVIOR_INVENTORY.md`, `docs/legacy/SECURITY_AND_CONTAMINATION_AUDIT.md`, `docs/legacy/REUSE_DECISIONS.md`.
12. ✅ Committed only clean scaffolding and reports.

## Acceptance evidence

| Criterion | Evidence |
|---|---|
| Original repo unchanged, no new commits/pushes | `git log -1` still `ef07a270`; `git status` clean; push URLs `DISABLED` |
| New repo exists and is private | `gh repo view OneBigHen/GuideForge` → `PRIVATE` |
| Exact source reference preserved | branch + annotated tag + read-only worktree at `ef07a270` |
| No secrets/customer data/GSK branding/databases/uploads/runtime/node_modules in new `main` | audit in `SECURITY_AND_CONTAMINATION_AUDIT.md`; new `main` contains only scaffold + AGENTS.md + LEGACY_ORIGIN.md + docs |
| Reports identify reuse/rewrite/fixture/discard per subsystem | `REUSE_DECISIONS.md` |

## Test results

- Secret scan: 6 files matched benign templates/design flaws; **0 live secrets**.
- Traversal/db/upload scan: only `.gitkeep` tracked; runtime state confirmed untracked.
- No tests run in this phase (no product code; reference tests belong to legacy).

## Security and privacy impact

- Legacy `VITE_API_KEY` design flaw, hard-coded tenant URI, and dual-store
  fallback confirmed as risks to design out (all already required by spec).
- No secrets or contamination entered the new repository.

## Persisted schema and migration impact

- None (no persisted schema in GuideForge yet). Migration strategy from legacy
  is documented in `REUSE_DECISIONS.md`.

## Known limitations

- The build pack's reference commit could not be preserved because it is
  unreachable; the shipped HEAD was used instead and the discrepancy documented.
- `Sample_Guide.guide` fixture is referenced for future interop tests but not
  yet copied into `packages/test-fixtures` (deferred to Phase 02/07 with a
  fixture-reuse note).

## Blocked external dependencies

- None.

## Next phase readiness

- READY. Phase 01 (universal foundation) can start: toolchain pinning via
  Context7, monorepo scaffold, web + Tauri shell, CI.

**Gate:** PASS
