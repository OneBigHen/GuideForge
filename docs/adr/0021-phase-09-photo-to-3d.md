# ADR 0021: Phase 09 Photo-to-3D Queue and Provider Boundary

## Status

Accepted for the Phase 09 implementation.

## Decision

Keep photo-to-3D preparation deterministic and local-first. Sanitize JPEG,
PNG, and WebP metadata before storage, require a bounded multi-view photo set,
and reject inadequate dimensions, duplicate views, missing licenses, or
unsupported GPU profiles before a job is queued.

The browser uses the versioned Dexie job record and the companion app exposes
a native SQLite queue seam. Jobs move through draft, owner approval, cleanup,
and completion states; completion requires a content hash for the cleaned GLB.
Provider descriptors cover the optional Hunyuan3D-2GP local adapter and a
TripoSR fallback, but neither provider is silently replaced with a mock.

Cleanup is represented as a validated Blender argv plan with deterministic LOD
ratios. Provider output, scale/orientation execution, and reviewed GLB
generation remain external acceptance gates until a supported GPU and runtime
are available.

## Consequences

- Source photos are stored only after EXIF and supported PNG/WebP metadata are
  removed, with hashes and a reuse key retained for deduplication.
- Cancellation, pause/resume, approval, and cleanup transitions are testable
  without pretending that a local model produced geometry.
- The `/photo-to-3d` wizard searches the existing local asset library first and
  requires explicit provider-license acknowledgement.
- Actual Hunyuan3D/TripoSR inference, Blender execution, and physical-camera
  behavior remain unverified rather than being represented by fixture output.
