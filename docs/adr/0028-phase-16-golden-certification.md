# ADR 0028: Phase 16 Golden Certification Boundary

## Status

Accepted for narrow local certification; external provider, GPU, device, and
deployment gates remain open.

## Decision

Use one data-driven certification harness for the three required project
shapes. Feed it through the existing source, canonical snapshot, training,
runtime evidence, spatial compiler, asset, package, and restore seams. Use
deterministic local Markdown and procedural assets where live providers are
unavailable, and assert blocked capability states rather than substituting a
successful result.

Require semantic snapshot equality after clearing both Yjs persistence and the
browser stores. Require package reports and referenced source/asset/runtime
entries to be present before import.

## Consequences

- Fixture-specific hardcoding is not needed to certify the shared product path.
- Local-first behavior, citation conservatism, typed evidence, spatial
  validation, package recovery, and report persistence have current evidence.
- The test cannot certify provider quality, real document conversion, GPU mesh
  quality, physical interaction, or production deployment; those remain
  explicit release gates.
