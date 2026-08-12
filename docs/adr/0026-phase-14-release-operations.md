# ADR 0026: Release Candidate Operations and Recovery

## Status

Accepted for Phase 14.

## Decision

Keep version authorities separate. The release candidate version is operational
metadata; app/package, project-schema, `.gforge` format, companion API, storage,
runtime, and prompt versions are independently checked by
`scripts/check-release-policy.mjs`.

Use the existing Vite output as the PWA artifact and ship a small nginx policy
fragment with CSP, security headers, immutable hashed assets, and no-cache
HTML/service-worker metadata. The service worker remains responsible for the
existing user-controlled update path; an update must not silently discard an
active session.

Use Tauri 2's native build boundary for desktop packaging. The current local
matrix supports only Linux x86_64 `.deb` in this environment. Windows and macOS
remain explicit external-runner targets requiring platform certificates and,
for macOS, notarization. No unsigned local artifact is presented as a supported
platform release.

Use a filesystem lifecycle seam for candidate verification and recovery:
verify manifest hashes, stage a new release, move the old release to history,
atomically activate the new directory, and keep `dataDir` outside release
directories. Rollback restores the previous release without moving user data.

Use the existing companion key store for signed personal `.gforge` output. The
browser may send the canonical manifest to the authenticated companion and
assemble the returned signature, but never receives the private key. Without a
companion, the package stays explicitly unsigned.

Every candidate emits SHA-256 records, a machine-readable manifest, SBOM,
license inventory, build provenance, migration report, and release notes. The
candidate is not promoted to 1.0 until external platform, deployment, physical
install, and later golden/security phases close their own gates.

## Consequences

- Candidate creation and rollback are repeatable on a clean release host.
- Data preservation is structurally independent from code replacement.
- The release folder is auditable without making ignored build output part of
  the source repository.
- Platform signing remains visible as a real external dependency instead of an
  unverifiable local claim.
- CycloneDX output is available now, but its known npm inventory diagnostics
  remain an explicit release-quality follow-up.
