# Phase 17 Report — Production 1.0 Cut

## Decision

**NO 1.0 CUT.** The current tree is a reproducible `0.14.0-rc.1` release
candidate, not a certified 1.0. Local engineering gates pass, but the Phase
17 gate requires evidence that is unavailable on this host and also requires
current-SHA external CI evidence. No version bump, tag, publication, or
remote push was made.

Audited commit: `0a6765dd3d01ccb5c8844b35732351e76d48117f`.

## Current-tree evidence

| Gate                      | Result                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forced repository check   | `pnpm check --force`: **125/125 tasks passed**, 7m13s                                                                                                                     |
| Browser acceptance        | `CI=1 pnpm --filter @guideforge/web exec playwright test`: **78 passed, 6 skipped**, 84 tests, desktop/iPad/iPhone emulation, one worker; cold-shell sample p95 1.392s    |
| Phase 16 golden path      | **3/3 passed**: micropipette, peristaltic pump, whole-house filter                                                                                                        |
| Release policy/build      | `pnpm release:prepare`: exit 0; release `0.14.0-rc.1`, app `0.1.0`, schema `5`, package `2`, companion `0.5.0`                                                            |
| Candidate verification    | 100 payload files, SHA-256 manifest, Linux x86_64 `.deb`, provenance, migration report, release notes, license inventory, and CycloneDX `sbom.xml` generated and verified |
| Recovery                  | `pnpm release:drill`: install, upgrade, rollback, and data preservation passed                                                                                            |
| Supply-chain/local policy | audit, license, policy, boundary, dependency, and secret checks passed; Strix was inconclusive because the local CLI was unavailable                                      |

The release candidate is in the ignored local directory
`release-artifacts/0.14.0-rc.1/`. Its provenance records `dirty=false` and the
audited commit. The license inventory and SBOM commands exit successfully, but
the pinned SBOM/license inventory path emits npm dependency-tree warnings; the
reports are therefore artifacts, not a claim of diagnostically clean npm
metadata.

## Acceptance blockers

| Required acceptance                               | Current evidence                                                                                                                                                      | Decision                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Current SHA has GitHub CI status                  | `gh run list` shows the latest successful branch run at prior SHA `8f975db`; current `0a6765d` is not pushed. GitHub status readback is `pending` with zero statuses. | **BLOCKER**                            |
| Real Docling/OCR/ASR/VLM corpus                   | No configured provider runtime or real multimodal corpus on this host.                                                                                                | **BLOCKER**                            |
| Real DeepSeek Source Studio synthesis             | `DEEPSEEK_API_KEY` is absent; only the explicit offline fallback is exercised.                                                                                        | **BLOCKER**                            |
| GPU/photo-to-3D provider output and reviewed mesh | Phase 16 correctly records the CPU job as `blocked`; no GPU/provider output is claimed.                                                                               | **BLOCKER**                            |
| Physical iPad/iPhone/Pencil/camera/PWA lifecycle  | Browser profiles are emulation. No physical device, camera capture, installed-PWA lifecycle, or production HTTPS deployment is available.                             | **BLOCKER**                            |
| Windows/macOS signed native artifacts             | The supported local native matrix is Linux x86_64 `.deb`; external signed/notarized targets are not claimed.                                                          | **Out of local support matrix**        |
| Local owner/auth/security path                    | Current forced tests and release policy cover the local companion/auth, HTTPS-cookie, CSRF/origin, rotation/revoke, secret-boundary, and signing seams.               | **PASS LOCALLY; not deployment proof** |

The external hardware/platform limits are kept out of the local support claim,
but provider, CI, deployment, and real-corpus requirements are not hardware
items that can simply be relabeled unsupported while still calling the product
1.0. They remain explicit blockers.

## Release posture

The candidate is suitable for continued RC testing on the local-first browser
path and Linux packaging path. It is not suitable for a 1.0 tag or release
announcement until the blockers above have fresh evidence. The capability
matrix and execution ledger are updated to make this no-cut decision current.
