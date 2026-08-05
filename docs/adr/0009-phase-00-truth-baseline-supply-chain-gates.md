# ADR 0009 — Phase 00 Truth Baseline: Supply-Chain Gates and CI E2E

**Status:** Accepted
**Date:** 2026-08-05
**Phase:** 00 (truth baseline)

## Context

`CURRENT_REPO_AUDIT.md` and the single-user build pack require that the
repository's phase reports be proven by CI:

- Playwright E2E never ran in CI despite 9 specs and full config;
- the `apps/api` integration tests need PostgreSQL but CI provided no service;
- dependency audit, license report, and SBOM steps all used `|| true` and were
  advisory only, contradicting ADR-0001's claim that they are gates;
- the boundary checker matched forbidden substrings against whole-file text,
  producing false positives from comments;
- the root `pnpm format:check` (which covers `docs/`) already failed at the
  audited baseline commit `5d9a1d2` on `docs/adr/0006`.

## Current official documentation

- Library/product: GitHub Actions (`actions/checkout`, `setup-node`,
  `upload-artifact`, `download-artifact`)
- Exact versions: actions/checkout@v7, actions/setup-node@v7,
  actions/upload-artifact@v4, pnpm/action-setup@v4
- Primary source: https://docs.github.com/en/actions
- Library/product: gitleaks action
- Exact version: gitleaks/gitleaks-action@v3.0.0
- Primary source: https://github.com/gitleaks/gitleaks-action
- Library/product: CycloneDX SBOM generator
- Exact version: @cyclonedx/cyclonedx-npm@6.0.0
- Primary source: https://github.com/CycloneDX/cyclonedx-node-npm
- Verified date: 2026-08-05

## Decision

1. **CI runs Playwright** in a dedicated `e2e` job that depends on `check`,
   installs Chromium + WebKit via `playwright install --with-deps`, runs
   `pnpm --filter @guideforge/web test:e2e`, and uploads
   `playwright-report/` + `test-results/` as artifacts.
2. **CI provides PostgreSQL 17** as a service for the `check` job and sets
   `DATABASE_URL` so `apps/api` integration tests run against a real database
   in CI.
3. **Supply-chain gates are blocking and policy-driven**:
   - `scripts/check-audit-policy.mjs` — parses `pnpm audit --json`; high/
     critical always block; moderate/low block unless listed in
     `docs/security/reviewed-exceptions.json` (with rationale + expiry).
   - `scripts/check-license-policy.mjs` — parses `pnpm licenses list --json`
     (pnpm-native, full graph); blocks GPL/AGPL/SSPL/BUSL/CC-BY-NC unless
     allowed by exception.
   - `pnpm security:sbom` — `@cyclonedx/cyclonedx-npm@6.0.0` with
     `--ignore-npm-errors`, `npm_execpath` unset so it uses system `npm ls`
     (the pnpm `ls --all` path is unsupported by pnpm 10.33.2); SBOM uploaded
     as an artifact with `if-no-files-found: error`.
   - `scripts/secret-scan.sh` — gitleaks when available, stricter regex
     fallback otherwise; any match fails.
   - `docs/security/supply-chain-policy.md` documents the policy; reviewed
     exceptions live in `docs/security/reviewed-exceptions.json` (JSON Schema:
     `reviewed-exceptions.schema.json`).
   - The single current finding (esbuild 0.18.20 moderate, via dev-only
     `drizzle-kit` esm-loader) is recorded as reviewed exception SUPPLY-0001.
4. **Boundary checker fixed** to extract real module specifiers
   (ESM `import`/`export`, dynamic `import()`, `require()`) instead of
   matching whole-file text.
5. **Catalog pinning completed**: `@types/pg`, `tsx`, `@axe-core/playwright`,
   and `@cyclonedx/cyclonedx-npm` moved to the `pnpm-workspace.yaml` catalog so
   `pnpm dep-check` passes.
6. **Format baseline repaired**: `docs/adr/0006` (pre-existing failure at the
   audited commit) formatted so root `pnpm format:check` passes.
7. **No-credential AI test added** in `model-gateway` proving the gateway
   reports explicit unavailability when no adapter is configured and never
   fabricates output; offline authoring requires an explicitly registered
   deterministic adapter whose receipt exposes the real provider.

## Alternatives

- Run E2E in the same job as `check`: rejected — the 45-minute Playwright job
  with browser installs would slow every commit; a separate job keeps static
  checks fast and keeps browser/artifact concerns isolated.
- `pnpm dlx license-checker`: rejected — unreliable with pnpm's virtual store
  (only 11 packages visible) and broken by the global
  `dangerously-allow-all-builds` config; `pnpm licenses list --json` sees the
  full graph.
- SBOM via `pnpm dlx @cyclonedx/cyclonedx-npm`: rejected — the tool invokes
  `pnpm ls --all` when `npm_execpath` points at pnpm, which pnpm 10.33.2 does
  not support; pinning the package and unsetting `npm_execpath` is
  deterministic.
- Keep audit/license/SBOM advisory: rejected — the pack and ADR-0001 require
  real gates.

## Consequences

### Data and migration

- None (no persisted-format changes in this phase).

### Security/privacy

- Secrets never in CI logs: gitleaks redacts; audit/secret scans fail closed.
- `docs/security/reviewed-exceptions.json` documents every permitted
  moderate/low finding with an expiry; a red build is the default for anything
  unreviewed.
- SBOM and license reports become CI artifacts, improving supply-chain
  transparency.

### Browser/device

- Playwright E2E now runs in CI across desktop Chromium, iPad (WebKit), and
  iPhone (WebKit) emulation; artifacts are retained 14 days.

### Cost/performance

- CI runtime grows by the e2e job (~3–5 min browser install + ~1.5 min tests);
  no runtime product cost.

### Licensing

- License policy blocks GPL/AGPL/SSPL/BUSL/CC-BY-NC at CI time; current graph
  is clean (0 blocked).

## Acceptance evidence

- `pnpm check --force`: 100/100 tasks pass (fresh, no turbo cache).
- `pnpm format:check`, `pnpm boundary`, `pnpm dep-check`: pass.
- `pnpm security:audit` / `security:licenses` / `security:secret-scan`:
  pass; `security:sbom` produces `sbom.xml` (2.08 MB CycloneDX 1.6).
- `pnpm security:policy-test`: 5/5 pass (positive + negative paths for audit
  and license policies).
- `pnpm --filter @guideforge/web test:e2e`: 37 passed / 2 skipped (WebKit
  offline limitation).
- Policy scripts fail when exceptions are removed (verified exit code 1).

## Revisit trigger

- pnpm adds first-class SBOM/audit JSON with a stable schema (re-evaluate
  parser).
- A high/critical advisory without a fix appears (policy requires immediate
  fix, not a new exception).
- Playwright browser install time exceeds CI timeouts.
