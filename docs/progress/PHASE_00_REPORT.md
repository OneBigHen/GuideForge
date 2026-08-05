# Phase 00 Report — Truth Baseline and CI

## Outcome

The repository's claims are now verified by CI. Baseline established at
`5d9a1d29` (the audited commit); a fresh forced run of every static check, the
full Playwright suite (desktop + iPad + iPhone emulation), policy-gated
supply-chain gates, and a no-credential AI test now pass. The capability
matrix is honest: it records implemented, partial, and missing capabilities
and names the gaps the pack's later phases must close.

The original (pre-single-user) phase reports were preserved verbatim in
`docs/progress/legacy/*_original.md` as evidence of intent (per
`START_HERE.md`: original reports are evidence of intent, not proof of
completeness).

## User-visible vertical slices

Phase 00 is infrastructure; the user-visible effects are:

- CI now actually runs the browser E2E suite and Postgres-backed integration
  tests (previously claimed but not executed in CI).
- Supply-chain failures are blocking and visible (audit/license/SBOM/secret),
  with a documented reviewed-exceptions policy instead of silent `|| true`.
- A capability matrix and baseline performance/bundle report replace
  overstated phase-report claims with measured evidence.

## Commits

- `066ee0d` chore: establish single-user AI studio execution baseline
  (branch `feat/single-user-ai-studio`, AGENTS_SINGLE_USER.md installed)
- (this commit) Phase 00 CI/supply-chain/audit work

## Exact commands and results

| Command                                                                                | Result                                                                  |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` (after `rm -rf node_modules apps/*/node_modules ...`) | clean, 810 packages, 17s                                                |
| `pnpm check --force`                                                                   | 100/100 tasks pass (fresh, no cache)                                    |
| `pnpm format:check`                                                                    | pass (after fixing pre-existing `docs/adr/0006`)                        |
| `pnpm boundary`                                                                        | pass (after fixing false-positive whole-file matching)                  |
| `pnpm dep-check`                                                                       | pass (after catalog-pinning `@types/pg`, `tsx`, `@axe-core/playwright`) |
| `pnpm security:audit`                                                                  | pass (esbuild moderate = reviewed SUPPLY-0001)                          |
| `pnpm security:licenses`                                                               | pass (0 blocked licenses in full graph)                                 |
| `pnpm security:sbom`                                                                   | pass — `sbom.xml` 2.08 MB CycloneDX 1.6                                 |
| `pnpm security:secret-scan`                                                            | pass (no matches)                                                       |
| `pnpm security:policy-test`                                                            | 5/5 pass (positive + negative paths)                                    |
| `pnpm --filter @guideforge/web test:e2e`                                               | 37 passed / 2 skipped (WebKit offline)                                  |

## Acceptance evidence

Gate items from `prompts/phases/PHASE_00_TRUTH_BASELINE.md`:

| Gate                                                            | Evidence                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Clean install and all mandatory checks pass                     | frozen install + `pnpm check --force` 100/100                                                                |
| CI actually runs E2E                                            | `e2e` job in `.github/workflows/ci.yml` (Chromium + WebKit, artifacts)                                       |
| No capability report overstates hardware/provider evidence      | `docs/progress/CAPABILITY_MATRIX.md` — real-device rows are `blocked`, provider rows are `partial`/`missing` |
| Failing security/license checks visible and blocking per policy | `docs/security/supply-chain-policy.md` + blocking CI steps + `reviewed-exceptions.json`                      |

## AI/provider evidence

- No-credential test added to `model-gateway`: gateway with no configured
  adapters returns `ok:false`, no output, explicit receipt (`provider: gateway`),
  and never fabricates; offline authoring requires an explicitly registered
  deterministic adapter whose receipt exposes the producing provider.
- Live DeepSeek/Docling calls remain gated on credentials (skipped without
  them) — unchanged from the previous phase; CI does not hold a key.

## Device evidence

- Playwright: desktop-chromium, ipad (iPad Pro 11), iphone (iPhone 13) all
  run in the new CI `e2e` job; 37 passed / 2 skipped (WebKit cannot navigate
  offline — `apps/web/e2e/offline.spec.ts:11`).
- Real-device (Safari/Pencil/camera) is an external blocker, recorded as such.

## Accessibility evidence

- WCAG 2.2 axe scans run in E2E across all three projects and pass at
  baseline (no critical/serious violations).

## Security/privacy/license impact

- Secret scan: gitleaks (v3.0.0 action) + regex fallback; hard failure on any
  match.
- Audit: high/critical always block; moderate/low block unless reviewed
  (SUPPLY-0001: esbuild 0.18.20 moderate via dev-only drizzle-kit, expiry
  2026-11-05).
- License: GPL/AGPL/SSPL/BUSL/CC-BY-NC block; full-graph `pnpm licenses list`
  scan; current graph clean.
- SBOM: blocking generation, uploaded artifact.
- No secrets, keys, or private artifacts added to the repo.

## Persisted schema/migrations

- None in this phase.

## Package round-trip impact

- None in this phase (package writer unchanged).

## Performance and cost

- Baseline bundle: main chunk 1,583,290 B (452.55 kB gzip), single 1.58 MB
  route-less bundle above the 500 kB advisory — recorded in
  `docs/progress/BASELINE_PERFORMANCE_REPORT.md` for Phase 13.
- CI cost: one extra `e2e` job (~5 min); no product runtime cost.

## Known limitations

- gitleaks action requires `GITHUB_TOKEN`; the regex fallback covers
  environments without it.
- `pnpm dlx license-checker`/`pnpm dlx @cyclonedx/cyclonedx-npm` remain broken
  locally by the global `dangerously-allow-all-builds` config; the pinned
  devDependency + `pnpm licenses list` path is the supported route.
- `apps/web` e2e depends on a host quirk: the sandbox exports
  `PLAYWRIGHT_BROWSERS_PATH=0` in `.bashrc`, so local runs need
  `PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright`. CI is unaffected.

## External blockers

- Real-device (Safari/Pencil/camera/Quick Look) testing cannot run in this
  sandbox; emulation evidence only.

## Next-phase readiness

Phase 01 (single-user repairs) can start: the audit findings it must fix are
itemized in `docs/progress/CAPABILITY_MATRIX.md` (body-supplied roles, padded
FNV hashes, adapter key retention, shallow validation, localStorage signing
key, synchronous unzip, stale hierarchy actions, silent fake fallback, random
audit org IDs, stub approval invalidation).

**Gate:** PASS
