# Phase 10 Report — Semantic Anchors and Annotation Engine

## Gate status

The Phase 10 gate is **VERIFIED NARROWLY** on the current tree. Durable
mesh-local surface attachments, v4 migration, transform-derived world points,
asset replacement correction state, annotation/measurement/step-state
controls, package round-trip persistence, and emulated browser review passed.

This does not claim a live multiview renderer, vision provider, physical
raycast, Pencil input, or real-device visual overlay.

## Delivered path

- Guide schema v5 adds checked-in `SurfaceAttachment` records with asset hash,
  mesh/primitive/triangle identity, optional barycentric coordinates,
  mesh-local point/normal, source, confidence, and review state.
- Pure v4 -> v5 migration copies old anchors into `legacy` attachments marked
  `needs-correction`; working-document scene normalization handles old Yjs
  scene JSON as well.
- `scene-core` keeps attachments in local mesh coordinates, derives world
  positions after move/rotate/scale, provides geometric anchors, bounded
  raycast/vision observation selection, measurement commands, and step-state
  commands. Replacing an asset marks attached points stale.
- The scene editor exposes local-anchor creation, x/y/z correction, review or
  correction state, arrows/labels/callouts/highlights/paths, measurements,
  step-state records, and an accessible DOM list alongside the viewport.
- Collaboration converters and the `.gforge` round-trip preserve attachments
  and step state through the canonical Yjs scene.

## Evidence

| Check                                             | Result                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| Guide schema and migration tests                  | 15 tests passed; v4 anchor migration covered                     |
| Scene core                                        | 20 tests passed; transform/rebind behavior covered               |
| Collaboration                                     | 5 tests passed                                                   |
| Web typecheck, lint, build and focused round-trip | Passed; 2 round-trip tests passed                                |
| Browser acceptance                                | `scene03.spec.ts`: 6/6 desktop, iPad, and iPhone projects passed |
| Schema/diff checks                                | GuideSnapshot schema parses; formatting passed                   |

## Known boundary

The renderer currently has no live mesh-pick or multiview vision backend; the
observation contract and deterministic chooser are present, but provider
execution is unverified. Real 3D overlay rendering, camera/raycast fidelity,
Pencil/touch behavior, and physical-device acceptance remain Phase 13 or
hardware-gated work.

**Gate:** VERIFIED NARROWLY — canonical attachment persistence, lifecycle,
transform stability, correction/review UI, package round trip, and emulated
browser evidence passed; live multiview/raycast/vision and physical-device
overlay evidence remain unverified.
