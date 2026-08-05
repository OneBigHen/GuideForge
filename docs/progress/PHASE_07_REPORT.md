# Phase 07 Report — Signed Releases, Microsoft Interop, and Native Desktop

## Outcome

Verifiable, deterministic signed releases, safe Microsoft `.guide`
interoperability, and the native desktop seam are implemented and tested.
Releases are RFC 8785-canonicalized and Ed25519-signed with offline
verification (one-byte tampering fails); the Microsoft importer produces
compatibility reports, preserves unknown fields, refuses silent loss on
export, and never hard-codes tenant URIs; the Tauri shell is extended with
filesystem + secure-store plugins and `storage-native` adapters for the same
web app.

## Commits

- `(this commit)` feat: Phase 07 signed releases, Microsoft interop, native desktop

## Delivered vertical slices

1. **package-gforge signing** (`signing.ts`, `release.ts`):
   - RFC 8785 canonical JSON (`canonicalize@3.0.0`),
   - Ed25519 (`@noble/curves`) keygen/sign/verify, public-key derivation,
   - `TrustedKeyStore` (activation, rotation, revocation ledger),
   - deterministic signed release package (`signatures/release-signature.json`),
   - offline `verifyReleasePackage` (entry hashes + canonical payload + sig).
2. **interop-ms-guide**: safe TAR parser (traversal/symlink/duplicate/size
   bounds), `importMsGuide` → canonical snapshot + compatibility report with
   unknown-field preservation + dropped-asset reporting, supported-subset
   `exportMsGuide` that refuses silent loss unless approximations accepted,
   custom POSIX ustar writer (deterministic), no tenant URIs anywhere.
3. **apps/web**: "Export release" (Ed25519 signed, key persisted locally,
   public key shown), "Import .guide" in the library; draft `.gforge` export
   remains.
4. **storage-native**: Tauri filesystem asset store + credential store
   abstractions (tested with injected IO); Tauri shell wires `tauri-plugin-fs`
   + `tauri-plugin-store` and capabilities (same web build).

## Acceptance evidence

| Gate | Evidence |
|---|---|
| One-byte package tampering fails | signing test flips a byte → verification fails |
| Revoked release behavior correct | TrustedKeyStore revocation test |
| Every Microsoft import produces a compatibility report | round-trip test asserts `report` fields |
| Unsupported export cannot silently lose content | refusal test throws without `acceptApproximations` |
| Same web editor runs against native filesystem adapter | `NativeFsAssetStore` + `MemoryCredentialStore` tests |
| Deterministic release (same inputs → same bytes) | signing determinism test |
| No hard-coded tenant URI | interop test asserts no `crm.dynamics.com` / `dataverse` |

## Test results

- `pnpm check`: 90/90 tasks pass.
- package-gforge: 16 tests (incl. signing 8: sign/verify, wrong-key, round-trip,
  tamper, determinism, key management).
- interop-ms-guide: 6 tests (parse safety, round-trip, refusal, approximation
  report, unknown fields, no tenant URI).
- storage-native: 2 tests.
- Playwright: 28 passed / 2 skipped (WebKit offline), incl. release export e2e.

## Responsive/device evidence

- Release export and .guide import are toolbar/library actions verified on
  desktop (Playwright); iPad/iPhone inherit the same web build.

## Accessibility evidence

- Release status uses `role="status"`; buttons are labeled; file inputs are
  visually-hidden but keyboard-focusable within labeled buttons.

## Security and privacy impact

- Ed25519 signing key generated locally and stored in localStorage (demo
  placement; production path is Tauri secure store / server key management).
- Signatures are key-domain-separated from session/object encryption (key
  store separates domains).
- Interop parser is bounds-checked and rejects traversal/symlinks/duplicates.
- No tenant/environment URIs in any export; compatibility reports expose all
  losses to the user.

## Persisted schema and migration impact

- No new persisted schema; signing keys are per-guide localStorage (demo).
- Release package format `gforge-release` v1 is deterministic and versioned.

## Context7/ADR updates

- ADR 0007 (signed releases + interop + native) added.

## Known limitations

- Tauri native build cannot run in this sandbox (read-only root FS blocks
  webkit2gtk system libs; documented since Phase 01). The shell config,
  plugins, and capabilities are complete; `pnpm --filter @guideforge/desktop
  build:tauri` must run on a host with the system libraries.
- Microsoft import/export is experimental: target-client opening evidence and
  a legally obtained fixture corpus are required before non-experimental
  status (per spec); our tests use self-generated fixtures.
- Signing keys in localStorage are a demo placement; production moves to the
  Tauri secure store (storage-native) or server key management.

## Blocked external dependencies

- Tauri native compile (system libraries unavailable in sandbox).
- Legally obtained Microsoft `.guide` fixture corpus for non-experimental
  status.

## Next phase readiness

- READY. Phase 08 (XR, Apple delivery, accessibility, security, GA) builds on
  the verified release/interop/native foundations.

**Gate:** PASS
