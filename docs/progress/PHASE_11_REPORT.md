# Phase 11 Report — Deterministic AI Spatial Compiler

## Gate status

The Phase 11 gate is **VERIFIED NARROWLY** on the current tree. A micropipette
procedure can produce a coherent editable scene with semantic relationships,
bounded placement constraints, cameras, step states, surface annotations, and
typed scene commands without using LLM-produced final transforms.

## Delivered path

- `@guideforge/spatial-compiler` extracts equipment from structured tools/parts
  and a bounded known-equipment vocabulary, then adds a work-surface
  requirement.
- Licensed local GLB/glTF metadata is resolved before explicit procedural
  proxies. Unknown assets fail closed when proxy fallback is disabled.
- The graph records workspace, equipment, step, support, containment, use,
  point-to, near, and clear-zone relationships. The solver uses a stable seed,
  bounded candidate grid, workspace bounds, and non-overlap checks.
- Camera candidates, deterministic surface attachments, arrow annotations,
  per-step visibility/camera state, validation, and optional bounded critic
  diagnostics are emitted as typed scene commands.
- The spatial editor accepts the result through the existing Yjs-backed
  canonical scene path and reports proxy/validation status.

## Evidence

| Check | Result |
| --- | --- |
| Spatial compiler tests | 3 passed: micropipette scene, deterministic seed/critic, missing-asset fail-closed path |
| Spatial compiler typecheck/lint/format | Passed |
| Web typecheck/lint | Passed |
| Scene browser acceptance | 6/6 desktop, iPad, and iPhone emulated projects passed |
| Forced repository gate | `pnpm check --force`: 125/125 successful, 0 cached |
| Canonical command application | Commands materialize nodes, cameras, attachments, annotations, and step state in scene-core tests |

## Known boundary

The local compiler tests use deterministic fixture metadata and generated
proxies; they do not prove an external provider download, manufacturer asset
quality, live VLM/raycast observations, or physical device rendering. The
browser gate proves the editor acceptance path and DOM status, not a hardware
camera or rendered overlay inspection.

**Gate:** VERIFIED NARROWLY — deterministic compiler and canonical editor path
pass; external asset/provider quality, live spatial observations, and physical
device evidence remain unverified.
