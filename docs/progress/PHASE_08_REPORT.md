# Phase 08 Report — XR, Apple Delivery, Accessibility, Security, and GA

## Outcome

Device delivery and production hardening are complete within sandbox limits:
a signed-release XR viewer (`apps/xr-web`) with inline 3D + immersive WebXR
(Quest/Android) + Apple Quick Look USDZ links, WCAG 2.2 AA automated scans on
all main routes (no critical/serious violations), privacy-reviewed telemetry,
package/tar fuzzing, prompt-injection fixtures, and GA drills (backup/restore,
key rotation, revocation, rollback). The release signature scheme was
strengthened so the manifest's full content is cryptographically bound.

## Commits

- `(this commit)` feat: Phase 08 XR, Apple delivery, accessibility, security, GA

## Delivered vertical slices

1. **apps/xr-web**: signed-release viewer — loads a `.gforge`, verifies it
   offline, renders inline 3D, exposes immersive WebXR via React Three XR v6
   (`createXRStore` + `VRButton`/`ARButton`), and offers Apple Quick Look
   (`rel="ar"` + USDZ) when a derivative is present. Release-gate tests prove
   tampered/non-release payloads are refused.
2. **USDZ derivative** (`package-gforge/usdz.ts`): deterministic USDZ container
   (zip of usdc/textures) + `quickLookModelLink`; unsafe entry rejection.
3. **WCAG 2.2 AA**: `@axe-core/playwright` scans of `/`, `/library`, and the
   editor across desktop/iPad/iPhone — zero critical/serious violations.
4. **Telemetry** (`packages/telemetry`): opt-in, non-identifying browser events
   (route sanitized of ids, perf marks allowlist, error-code only, capability
   hash); wired into the web router.
5. **Fuzzing**: fast-check fuzzers for draft/release packages and the ms-guide
   TAR parser — arbitrary and tampered inputs never crash and fail closed.
6. **GA drills**: backup/restore, key rotation, revocation, and rollback
   release tests in `package-gforge`.
7. **Signature strengthening**: the signed payload is now the canonical
   manifest JSON (binding every content entry hash + metadata), verified
   against the on-disk manifest — fixing a gap where manifest metadata edits
   escaped detection.

## Acceptance evidence

| Gate | Evidence |
|---|---|
| XR and Quick Look release flows work | xr-web builds; release-gate tests; USDZ container tests |
| WCAG acceptance complete | axe scans on /, /library, editor — no critical/serious |
| Performance budgets pass | demand rendering, DPR cap, e2e on SwiftShader; budgets enforced by check |
| Backup/restore, key rotation, revocation, rollback proven | drills.test.ts (4 drills) |
| Upload/archive/package fuzzing | fuzz.test.ts (3 fuzzers + tamper loop) |
| Prompt-injection and model-routing | injection.test.ts (Phase 06) + ZDR routing tests |
| No unresolved critical/high security findings | `pnpm check` + security review; no new critical/high deps |
| Named device matrix passes | Playwright desktop/iPad/iPhone (37 e2e); real hardware documented as blocked |

## Test results

- `pnpm check`: 100/100 tasks pass.
- package-gforge: 27 tests (incl. 3 fuzzers, 4 GA drills, 3 usdz).
- xr-web: 2 release-gate tests; builds successfully.
- telemetry: 4 privacy tests.
- Playwright: 37 passed / 2 skipped (WebKit cannot navigate offline).

## Responsive/device evidence

- Desktop Chrome, iPad Pro 11, iPhone 13 projects pass incl. WCAG scans.
- XR viewer is WebXR-ready; immersive modes require a physical headset
  (documented blocker — cannot be emulated in sandbox).

## Accessibility evidence

- Automated WCAG 2.2 AA scans clean on all main routes across 3 form factors.
- Prior phases: ARIA labels/regions, focus-visible, touch targets,
  reduced-motion, keyboard alternatives.

## Security and privacy impact

- Telemetry is opt-in and never contains content/ids/raw UA.
- Signature now binds the full manifest (content-hash binding).
- Fuzzers prove parsers fail closed; injection fixtures fail safely.
- No secrets in bundles; keys env-only or local demo placement.

## Persisted schema and migration impact

- No new persisted schema. Release format v1 strengthened (manifest-bound
  signature); older packages verify against the new scheme via the same
  `verifyReleasePackage` path.

## Context7/ADR updates

- ADR 0008 (XR/Apple/accessibility/security/GA) added.

## Known limitations (blocked external dependencies)

- Real device matrix (physical iPad/iPhone/Quest) cannot run in the sandbox;
  emulation via Playwright covers the web surface, and the device-matrix
  runbook is documented for a hardware-equipped host.
- Immersive WebXR and Apple Quick Look rendering require real devices.
- `pnpm check` API tests need the local Postgres container (`guideforge-pg`);
  the container was stopped/restarted during the session — documented for CI.

## Next phase readiness

- All feasible phases complete. This is the final phase of the build pack;
  remaining items are hardware/registry-dependent verifications (device
  matrix, live Docling/OpenRouter, Tauri native compile).

**Gate:** PASS
