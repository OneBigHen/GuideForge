# ADR 0020: Phase 08 Asset Safety and Provider Boundaries

## Status

Accepted for the Phase 08 implementation.

## Decision

Keep the asset path local-first and content-addressed. Every imported file is
inspected before it is stored or exposed to the scene: self-contained GLB and
glTF are parsed for bounded JSON/resources and basic geometry health, while
OBJ, STL, and STEP remain explicit companion-conversion inputs. External glTF
buffers and images are rejected.

Provider integrations are represented by an allowlisted search contract rather
than hidden network downloads. Search terms are normalized and bounded, local
metadata is searched first, and provider records still require an explicit
license decision. Blank or unknown licenses fail closed for package embedding.

## Consequences

- Local procedural templates and safe GLB imports have a browser-tested path
  into the asset inventory.
- Geometry counts, bounds, source hash, review state, and derivative slots are
  visible in the inventory and remain part of the checked-in metadata schema.
- CAD and raw mesh conversion cannot silently enter the scene without a
  companion tool; FreeCAD is named for STEP and Blender for OBJ/STL.
- Provider download adapters, actual thumbnail/turntable generation, and
  clean-profile provider imports remain later acceptance work.
