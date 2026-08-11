# Phase 00 Report — Current HEAD Certification

## Gate status

Local Phase 00 evidence is complete. Overall certification remains **pending**
until GitHub runs the workflow against the pushed certification commit; no old
phase report is used as proof.

## Audit boundary

- Repository: `/root/Vibe/GuideForge`
- Branch: `feat/single-user-ai-studio`
- Audited parent SHA: `abefa7475d52931957721b571df828c364c7e924`
- Pack: `GuideForge_Production_Readiness_Pack_abefa747/`
- Runtime: Node `22.21.0`, pnpm `10.33.2`, PostgreSQL `17` in `guideforge-pg`
- Audit date: 2026-08-11

The pack was extracted from the repository-root ZIP and its binding files were
read. Existing phase reports are now explicitly historical; the current
matrix and ledger are the only status sources until each numbered phase is
re-executed.

## Exact local evidence

| Check                                  | Current result                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean frozen install                   | Pass: all 24 workspaces, 930 packages, `pnpm install --frozen-lockfile`                                                                         |
| PostgreSQL readiness                   | Pass: `docker exec guideforge-pg pg_isready -U guideforge -d guideforge` accepted connections on host port 15432                                |
| Forced repository check                | Pass: `pnpm check --force`, 115/115 tasks, 0 cached, 6m11.877s                                                                                  |
| Package fuzz/drills                    | Pass: `@guideforge/package-gforge`, 5 files / 35 tests                                                                                          |
| Canonical collaboration smoke          | Pass: `@guideforge/collaboration`, 1 file / 4 tests                                                                                             |
| Source/proposal/package targeted tests | Pass: 3 files / 9 tests (`sourceSynthesis`, `proposals`, `roundtrip`)                                                                           |
| Browser E2E                            | Pass: 43 passed, 2 expected skips, 45 total, desktop + iPad + iPhone projects                                                                   |
| Browser worker determinism             | `apps/web/playwright.config.ts` caps workers at 2 locally and 1 in CI after an 8-worker WebGL reproduction failed; the capped full suite passed |
| Audit policy                           | Pass: one reviewed esbuild finding, SUPPLY-0001                                                                                                 |
| License policy                         | Pass: no blocked licenses                                                                                                                       |
| SBOM                                   | Pass, exit 0: `sbom.xml`, 2.0 MB, CycloneDX 1.6; `npm ls` diagnostics are ignored by the pinned command                                         |
| Secret scan                            | Pass: gitleaks fallback regex, no matches                                                                                                       |
| Policy tests                           | Pass: all policy-script positive/negative cases                                                                                                 |
| Boundary/dependency checks             | Pass: `pnpm boundary` and `pnpm dep-check`                                                                                                      |

The first forced-check attempt was intentionally retained as failed evidence:
the helper Postgres container had exited (`exit 255`), and the API tests
reported `ECONNREFUSED` on 127.0.0.1/::1:15432. After the container was
restarted and readiness was verified, the complete forced check passed.

The first GitHub PR check was also retained as failed evidence: setup stopped
before project execution because the repository `.npmrc` forced the hosted
runner to use the non-writable absolute store path `/root/.cache/pnpm-store`.
That path setting was removed so pnpm can use the runner's environment-owned
store; `CI=true pnpm install --frozen-lockfile` then recreated all 930 packages
locally. The replacement run then passed setup, install, format, lint, and
typecheck, but its API tests still used the local 15432 fallback because Turbo
did not pass `DATABASE_URL` through strict task environment filtering. The
replacement now declares `DATABASE_URL` in `turbo.json` `globalEnv`; a focused
Turbo API run against the local Postgres service passed 17/17. A fresh GitHub
run then passed all preceding stages but gitleaks received a 403 while reading
the pull request because the workflow granted only `contents: read`; its regex
fallback passed. The workflow now grants `pull-requests: read`, and another
fresh run then reached gitleaks, which could not resolve the PR base commit
from the shallow checkout. The check job now fetches full history for that
scan, and another fresh run is pending.

## Explicit pack-required probes

- Source materialization is not certified: `materializeSnapshot` currently
  emits `sources: []`, while Source Studio records live in Dexie. The current
  round-trip test proves scene/training/assets, not source hydration.
- Proposal provenance is partially exercised: the web proposal tests pass and
  retain citations/receipts, but the complete source-backed package path is not
  proven.
- Source synthesis is only deterministic offline behavior: the current tests
  pass with the `synthesis-rules-v1` rules path. No live DeepSeek request or
  provider receipt has been proven in this audit.
- License policy is explicitly exercised and passes; this does not certify
  external asset-provider licensing.
- The execution player vertical slice passes in E2E, but the implementation
  labels photo capture as demo behavior and derives progress from evidence-row
  count. Real media capture, required-step completion, resume, and report
  semantics remain Phase 12 work.

## Reconciled historical claims

`docs/progress/PHASE_01_REPORT.md` through `PHASE_08_REPORT.md` now carry a
historical-only warning. In particular, the old Phase 06 fake/offline-provider
evidence is not treated as proof of real Docling or model-provider execution.

## Security/privacy/license impact

No credentials, runtime databases, browser profiles, SBOM, or test artifacts
were added to Git. The local install backup used during the clean-install
probe is outside the repository at
`/tmp/guideforge-node-modules-before-clean-20260811`.

## Remaining gate item

Read back a passing GitHub combined status for the replacement commit on PR
#1, targeting `main`, at the exact pushed SHA. Until that readback exists,
Phase 00 is not marked PASS.

**Gate: PENDING — GitHub current-SHA evidence**
