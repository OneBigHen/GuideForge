# Phase 14 Report — Release Engineering and Recovery

## Gate status

The Phase 14 gate is **VERIFIED NARROWLY**. GuideForge now produces a
versioned PWA/companion release candidate with a checked-in version policy,
headers, platform matrix, migration report, license inventory, CycloneDX SBOM,
provenance, release notes, SHA-256 manifest, and an install/upgrade/rollback
drill that preserves the data directory. The local Linux Tauri artifact builds
as a `.deb`; Windows/macOS signing and notarization remain external release
runner gates.

## Delivered path

- `release/version-policy.json` separates release, app, project-schema,
  package-format, companion API, storage, runtime, and prompt versions.
- `scripts/check-release-policy.mjs` fails on drift across package manifests,
  Tauri/Cargo, schemas, storage, runtime, companion OpenAPI, and PWA headers.
- `deploy/pwa/nginx.conf` provides CSP, no-store HTML/service-worker metadata,
  immutable hashed assets, SPA fallback, and baseline security headers.
- `release/tauri-matrix.json` records Linux x86_64 as locally buildable and
  Windows x86_64/macOS universal as external signed-runner targets.
- `scripts/build-release-metadata.mjs` emits the candidate package, companion
  compiled output, native bundles when present, licenses, SBOM, provenance,
  migration report, release notes, `SHA256SUMS`, and `RELEASE_MANIFEST.json`.
- `scripts/release-lifecycle.mjs` verifies payload hashes and atomically stages
  installs while keeping release history separate from the user data directory.
- The editor uses the existing companion signing-key boundary for signed
  personal `.gforge` exports. Browser-only export remains explicitly unsigned;
  private keys never enter browser storage.
- Tauri icons were generated from the existing web icon, closing the native
  packaging input gap.

## Evidence

| Check                    | Result                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release policy           | `pnpm release:policy`: passed for release `0.14.0-rc.1`, app `0.1.0`, schema `5`, package `2`, companion API `0.5.0`                                                                                 |
| Recovery                 | `pnpm release:drill`: install, upgrade, rollback, and data preservation passed                                                                                                                       |
| Signed personal package  | Web guide-store test: 6/6; companion signing test seam signs the canonical manifest and `verifyReleasePackage` returns `ok: true`                                                                    |
| Package signing/security | `pnpm --filter @guideforge/package-gforge test`: 38/38                                                                                                                                               |
| Web release path         | Web typecheck passed; companion `build:release` passed; web production build and bundle budget passed                                                                                                |
| Linux native artifact    | `pnpm --filter @guideforge/desktop build:tauri:linux`: Tauri produced `GuideForge_0.1.0_amd64.deb`                                                                                                   |
| Candidate metadata       | `pnpm release:prepare` and `pnpm release:verify`: 100 payload files verified, Linux `.deb` present                                                                                                   |
| Licenses/SBOM            | license policy passed; CycloneDX command exited 0 and emitted `sbom.xml`; its pinned `--ignore-npm-errors` mode reports npm inventory warnings, so dependency-tree diagnostics are not claimed clean |
| Secret policy            | fallback secret scan passed; gitleaks is unavailable on this host                                                                                                                                    |

## Known boundary

The `.deb` is a real locally built artifact, but this host does not have
Windows/macOS runners, signing certificates, or Apple notarization credentials.
Those artifacts are not marked supported here. The candidate manifest is
hash-verifiable and the `.gforge` path is Ed25519-signable, but native installer
signatures and notarization are not claimed. The PWA headers are checked in,
not externally deployed or verified through an installed physical browser.
The recovery drill exercises the lifecycle seam rather than installing a
package into the host OS. No 1.0 release claim follows from this phase.

**Gate:** VERIFIED NARROWLY — reproducible local candidate, Linux native build,
signed-package path, manifest verification, and recovery/data-preservation
evidence pass; external platform signing, notarization, deployment, and
physical install evidence remain unverified.
