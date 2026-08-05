# ADR 0007 — Signed Releases, Microsoft Interop, and Native Desktop

**Status:** Accepted
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 07

## Context

GuideForge must produce verifiable, immutable, offline-verifiable releases,
interoperate with Microsoft `.guide` without data loss or tenant leaks, and
run the same web app natively via Tauri with filesystem + secure-storage
access. The legacy exporter hard-coded a Dataverse URI, dropped anchors, and
had no loss report.

## Current official documentation

Verified via registry metadata 2026-08-04:

| Technology | Exact version |
|---|---|
| canonicalize (RFC 8785 JCS) | 3.0.0 |
| @noble/curves (Ed25519) | 2.2.0 |
| tauri-plugin-fs / tauri-plugin-store | 2 (crates) |

## Decision

1. **Signed releases**: `.gforge` release packages are deterministic ZIPs with
   `manifest.json`, `guide.json`, assets, and
   `signatures/release-signature.json`. The signature payload is the RFC 8785
   canonical JSON of the release manifest; Ed25519 (key domain separated from
   object encryption and session signing). Verification is offline: every
   entry hash + canonical payload + signature.
2. **Key management**: `TrustedKeyStore` models activation, rotation, and
   revocation with an append-only ledger; `isActive` honors revocation time.
3. **Microsoft interop**: `.guide` is parsed with a bounded, traversal-safe TAR
   reader (rejects `..`, absolute paths, symlinks, duplicates, oversized
   inputs). Import produces a canonical snapshot plus a compatibility report
   (warnings, unknown fields, dropped assets, unsupported features). Export
   covers only the supported subset and refuses silent loss unless the user
   explicitly accepts approximations. No tenant/environment URIs are ever
   emitted.
4. **Native desktop**: `storage-native` defines `NativeAssetStore` and
   `CredentialStore` interfaces (testable outside Tauri); the Tauri shell wires
   `tauri-plugin-fs` + `tauri-plugin-store` and capabilities while continuing
   to load the exact `apps/web` build (no second editor).
5. **Signing key placement**: demo uses per-guide localStorage; production
   moves to the Tauri secure store or server-side key management.

## Alternatives considered

### Alternative A — ECDSA/RS256 signing

Rejected: larger signatures, more bytes to canonicalize, no benefit over
Ed25519 for this artifact class.

### Alternative B — keep the legacy manual TAR exporter

Rejected: hard-coded tenant URI, no loss report, no supported-subset gate.

### Alternative C — browser-only verification with WebCrypto RSA

Rejected: WebCrypto RSA keys are larger and slower; noble/Ed25519 works in
browser and Node with identical semantics.

## Consequences

### Positive

- One-byte tampering fails verification; releases are immutable and
  offline-verifiable.
- Interop is safe and loss-reporting; unsupported export cannot silently lose
  content; no tenant leaks.
- Same web build runs in browser and Tauri; native FS/secure-store adapters
  are unit-tested.

### Negative

- localStorage key placement is a demo compromise (documented migration).
- Microsoft interop remains experimental until a legally obtained fixture
  corpus and target-client opening evidence exist.

### Security/privacy

- Key-domain separation; offline verification; bounded parsers; no secrets in
  browser bundles beyond the demo signing key.

### Data migration

- Release format v1 deterministic; future versions add pure migrations.

### Operations

- `pnpm check` covers signing/interop/native packages (24 tests).

## Acceptance evidence

- Signing: sign/verify, wrong-key rejection, tamper detection, determinism,
  key rotation/revocation.
- Interop: round-trip, silent-loss refusal, approximation report, no tenant URI.
- Native: filesystem store + credential store tests.

## Revisit trigger

- Wire production key management (Tauri secure store / server HSM).
- Validate Microsoft fixtures against a real Dynamics 365 Guides client.
