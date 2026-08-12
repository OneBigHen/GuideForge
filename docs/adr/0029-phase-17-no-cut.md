# ADR 0029 — Phase 17: Do Not Cut 1.0 Without External Evidence

## Status

Accepted — Phase 17 executed; 1.0 not cut.

## Context

The Phase 17 gate requires the current capability matrix, full local and CI
evidence, real device evidence, release artifacts, security/license/migration
reports, backup/restore, and known limitations. The current tree can produce a
verified local release candidate, but the current commit is not on the remote
branch and this host has no real provider corpus, DeepSeek key, supported GPU,
physical device lab, or production deployment.

## Decision

Keep `0.14.0-rc.1` as a local release candidate. Do not change the version
policy, create a tag, publish artifacts, or claim 1.0. Record local passes and
each unavailable external requirement separately in the Phase 17 report and
capability matrix.

## Consequences

- Local build, policy, package, checksum, migration, SBOM/license, browser,
  backup/restore, and recovery evidence remains reusable for the next gate.
- A future 1.0 cut must rerun CI on the exact SHA and close the provider,
  deployment, GPU, physical-device, and real-corpus blockers.
- Linux x86_64 is the only locally supported native artifact; Windows/macOS
  signing and notarization remain external release work.
