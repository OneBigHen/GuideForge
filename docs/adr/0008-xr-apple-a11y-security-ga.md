# ADR 0008 — XR Delivery, Apple Quick Look, Accessibility, Security, GA

**Status:** Accepted
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 08

## Context

GuideForge must finish device delivery (Quest/Android WebXR, Apple Quick Look),
meet WCAG 2.2 AA, harden parsers with fuzzing, add privacy-reviewed
observability, and prove GA drills (backup/restore, key rotation, revocation,
rollback). Sandbox limits prevent physical-device and registry-dependent
verification; these are documented as blockers with runbooks.

## Current official documentation

Verified via registry metadata 2026-08-04:

| Technology           | Exact version                                                   |
| -------------------- | --------------------------------------------------------------- |
| @react-three/xr      | 6.6.30 (`createXRStore` + `<XR store>` + `VRButton`/`ARButton`) |
| @axe-core/playwright | 4.12.1                                                          |
| three (GLTFLoader)   | 0.185.1                                                         |

## Decision

1. **XR viewer** (`apps/xr-web`): consumes only offline-verified signed
   releases; renders inline 3D; immersive WebXR via React Three XR v6;
   Apple Quick Look via `rel="ar"` + USDZ container.
2. **USDZ**: deterministic container (zip of usdc/textures, fixed mtime,
   store level), unsafe entry rejection; derivative generation is a
   worker-media job outside the browser.
3. **Accessibility**: automated WCAG 2.2 AA scans (axe) on `/`, `/library`,
   and the editor across desktop/iPad/iPhone; zero critical/serious
   violations required.
4. **Telemetry**: opt-in, non-identifying (route sanitized of ids, perf-mark
   allowlist, error codes only, capability hash). Never content, ids, or raw
   UA. Consent-gated sink.
5. **Fuzzing**: fast-check over package/`ms-guide` parsers and tamper loops;
   parsers must fail closed (never crash, never pass tampered content).
6. **GA drills**: automated tests for backup/restore, key rotation,
   revocation, and rollback of signed releases.
7. **Signature strengthening**: signed payload = canonical manifest JSON
   (binding every content entry hash + metadata); verifier re-canonicalizes
   the on-disk manifest and requires equality. Fixes a gap where manifest
   metadata edits (e.g. `createdAt`) escaped detection.

## Alternatives considered

### Alternative A — keep signature payload as entry-path list only

Rejected: manifest metadata edits were undetectable; the strengthened scheme
binds the full manifest.

### Alternative B — UA-based device branching in the viewer

Rejected: capability detection + WebXR feature detection, consistent with the
product's responsive strategy.

### Alternative C — full GLB→USDZ conversion in the browser

Rejected: heavy and device-dependent; worker-media generates derivatives
offline, the viewer only wraps them.

## Consequences

### Positive

- Tamper detection now covers the entire release content (fuzz-proven).
- WCAG scans pass on all main routes across three form factors.
- Fuzzers prove parsers fail closed.
- GA drills are automated and reproducible.
- Telemetry is provably privacy-safe by construction.

### Negative

- Physical-device and registry-dependent verification cannot run in this
  sandbox (documented runbooks).
- XR viewer bundle is large (three.js); code-split as a separate app.

### Security/privacy

- Opt-in telemetry; signature binds full content; fuzzers fail closed.

### Data migration

- Release format v1 strengthened in place; `verifyReleasePackage` handles both
  new and legacy payloads.

### Operations

- `pnpm check` (100 tasks) + Playwright (37) are the release gates.

## Acceptance evidence

- xr-web release-gate tests; USDZ container tests; axe WCAG scans; telemetry
  privacy tests; package fuzzing; GA drills; strengthened tamper tests.

## Revisit trigger

- Run the real device matrix (physical iPad/iPhone/Quest) on a
  hardware-equipped host.
- Run live Docling + OpenRouter validation (registry/key access).
- Compile the Tauri shell on a host with webkit2gtk.
