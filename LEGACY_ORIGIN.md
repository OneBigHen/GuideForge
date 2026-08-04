# Legacy origin

- Repository (as shipped): `gsk-tech/Guides-Studio` (formerly `OneBigHen/Guides-Studio`)
- Reference commit (shipped state): `ef07a2708991a1cd1797f3e428b313b2f2570ec3`
- Reference branch: `legacy/guides-studio-reference`
- Reference tag: `guides-studio-reference-ef07a270`
- Reference worktree: `~/Vibe/Guides-Studio-reference` (read-only)

## Discrepancy note (recorded 2026-08-04)

The GuideForge build pack identifies the reference as `OneBigHen/Guides-Studiov2`
at commit `2c85e8409b125b1d337522d41aff615aacf68723`. That repository and commit
are no longer reachable:

- `https://github.com/OneBigHen/Guides-Studiov2` returns 404 (repo not found).
- `https://github.com/OneBigHen/Guides-Studio` also returns 404.
- The commit `2c85e8409b125b1d337522d41aff615aacf68723` is not present in any
  local clone or reachable remote.

The only shipped reference available is the local repository
`/root/Vibe/Guides-Studio` (remote `gsk-tech/Guides-Studio`, live), whose HEAD
is `ef07a2708991a1cd1797f3e428b313b2f2570ec3` ("Update CI actions to current
runtimes", 2026-08-04). That HEAD was therefore preserved as the read-only
reference, and all Phase 00 audits were run against it.

The reference is read-only. Do not copy customer data, GSK branding, secrets,
databases, uploads, certificates, runtime bundles, or deployment configuration.
The legacy code is a behavioral and interoperability reference only.
