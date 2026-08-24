# ADR 0022: Phase 10 Mesh-Local Surface Attachments

## Status

Accepted for the Phase 10 implementation.

## Decision

Promote instructional targets from an implicit node/local point into a
versioned `SurfaceAttachment`. The record binds a node and asset hash to a
mesh/primitive/triangle when available, stores barycentric and mesh-local
coordinates, normal/confidence, source, and review state. World position is
always derived from the current node transform; editing a transform therefore
does not rewrite the attachment.

Guide schema v5 migrates v4 anchors into conservative `legacy` attachments
marked `needs-correction`. Existing anchors and target points remain in the
canonical scene for older readers, while new annotations carry an explicit
attachment id. Replacing an asset marks its attachments for correction rather
than silently trusting old geometry.

The editor provides deterministic geometric anchors when no raycast is
available, bounded raycast/vision observation contracts, point correction and
review controls, annotation kinds, measurement records, step-state records,
and DOM alternatives for the 3D viewport.

## Consequences

- Transform, package round-trip, and asset-reuse behavior is testable from the
  canonical scene/Yjs path.
- A real multiview renderer or vision provider can supply observations without
  changing the persisted contract; weak observations remain draft state.
- Actual mesh raycast, multiview vision inference, and physical device input
  remain external acceptance evidence rather than fixture claims.
