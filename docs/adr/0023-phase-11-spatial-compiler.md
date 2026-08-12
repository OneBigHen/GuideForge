# ADR 0023: Deterministic Spatial Compiler

## Status

Accepted for Phase 11.

## Decision

Compile structured procedure requirements into a semantic scene graph, bounded
constraints, stable-seed placements, camera candidates, surface attachments,
annotations, step states, and typed scene commands. Asset resolution searches
licensed local GLB/glTF metadata first. A procedural proxy is an explicit,
reported fallback; unknown requirements fail validation when no renderable
asset is available.

The compiler is pure and does not mutate Yjs or ask a model for final XYZ
transforms. The editor accepts its result by dispatching the compiler's typed
scene commands through the canonical scene command bus, and refuses scenes
that fail compiler validation. A visual critic is an optional bounded
diagnostic hook and cannot write scene state.

## Consequences

- The same guide and seed produce the same node, camera, attachment, annotation,
  and command identities.
- Placement, workspace, collision, missing-asset, attachment, and annotation
  failures are visible before acceptance.
- Reusable provider assets remain content-addressed; generated proxies are
  stored and labeled as proxies.
- Physical device rendering, mesh raycast/vision observations, and live
  provider downloads remain separate acceptance gates.
