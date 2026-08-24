# Supply-Chain Policy — Audit, License, SBOM, Secrets

**Phase:** 00 (truth baseline)
**Status:** Accepted
**Applies to:** every CI run on `main` and pull requests

## Policy

The following checks are **blocking** in CI. A failure is a red build; the only
way to pass with a finding is a recorded, time-bounded review exception in
`docs/security/reviewed-exceptions.json`.

### Dependency audit

- Command: `pnpm audit --audit-level=high`
- High/critical findings: **blocking**.
- Moderate/low findings: **blocking unless listed** in
  `docs/security/reviewed-exceptions.json` with a rationale and an expiry.
- A reviewed exception is removed when the finding is fixed or expires.

### License check

- Command: `pnpm dlx license-checker --summary --failOn 'GPL;AGPL'`
- GPL/AGPL (or otherwise unredistributable) runtime dependencies: **blocking**.
- The generated `licenses.json` report is uploaded as a CI artifact.

### SBOM

- Command: `pnpm dlx @cyclonedx/cyclonedx-npm --output-file sbom.xml`
- A failed SBOM generation is **blocking** (a release cannot ship without an
  inventory).
- The SBOM is uploaded as a CI artifact.

### Secret scanning

- Command: `gitleaks detect --redact --verbose` (installed in CI).
- Any detected secret is **blocking**. The regex fallback remains for
  environments where gitleaks cannot be installed.

## Current reviewed exceptions

| ID          | Package                                                         | Severity | Reason                                                                                                                                                                                        | Review date | Expiry     |
| ----------- | --------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| SUPPLY-0001 | esbuild 0.18.20 (via `@esbuild-kit/core-utils` ← `drizzle-kit`) | moderate | Dev-only `drizzle-kit` migration tooling; the advisory affects the esbuild dev server (request disclosure), which is never used in production or CI. Not exploitable in the shipped artifact. | 2026-08-05  | 2026-11-05 |

## Who may review

The repository owner (single user). Review exceptions must record:

- exact package and severity;
- why the finding does not affect this product;
- when it will be revisited.

## Escalation

If a finding cannot be justified, the fix (upgrade/override/patch) must land
before the branch merges. Silent `|| true` suppression is prohibited.
