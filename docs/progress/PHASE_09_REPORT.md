# Phase 09 Report — Local Photo-to-3D

## Gate status

The Phase 09 gate is **VERIFIED NARROWLY** on the current tree. The local
wizard, metadata sanitation, quality checks, provider/GPU/license planning,
durable job records, queue transitions, provenance, reuse planning, and
browser cancellation path are implemented and tested.

This does not claim that a consumer GPU ran Hunyuan3D-2GP or TripoSR, that a
reviewed reusable GLB was produced from real equipment photos, or that Blender
cleanup/scale/orientation execution has run on this host.

## Delivered path

- `@guideforge/assets` strips supported JPEG EXIF, PNG metadata, and WebP
  EXIF/XMP chunks before storage, checks dimensions and view labels, and
  requires three to twenty-four usable views.
- Provider descriptors and GPU profiles fail closed for missing license
  acceptance, CPU-only execution, insufficient VRAM, or too few photo hashes.
  Hunyuan3D-2GP and TripoSR remain explicit provider choices.
- `packages/storage-web` v9 persists photo jobs and a checked-in
  `PhotoTo3DJobRecord` schema. The companion SQLite migration adds the native
  `photo_jobs` queue with status, payload, provider, GPU, and timestamp fields.
- `/photo-to-3d` searches local assets before queueing, accepts multi-view
  images, exposes provider/GPU/license controls, and shows blocked/queued jobs
  with cancellation. The existing `/assets` path links to the wizard.
- Job transitions cover queue, pause/resume, cancellation, shape-draft
  approval, texture approval, cleanup, failure, and completion. Completion
  requires a cleaned-GLB hash. Cleanup emits a validated Blender argv plan
  with deterministic 1x/0.5x/0.2x LOD ratios.

## Evidence

| Check                                       | Result                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `@guideforge/assets` lint, typecheck, tests | 18 tests passed                                                                   |
| `storage-web` lint, typecheck, tests        | 9 tests passed; v9 persistence covered                                            |
| Companion lint, typecheck, tests            | 12 tests passed; SQLite queue covered                                             |
| Web typecheck, lint, build                  | Passed; existing bundle/externalization warnings only                             |
| Browser acceptance                          | 3/3 desktop, iPad, and iPhone projects passed                                     |
| Browser path covered                        | Three sanitized PNG inputs, search-before-generate, blocked CPU job, cancellation |

## Known boundary

No supported consumer GPU, Hunyuan3D-2GP runtime, TripoSR runtime, Blender
conversion run, or real camera capture was available for this phase. The
companion SQLite queue is a tested native seam; the browser path uses its
versioned Dexie mirror. Actual model inference, reviewed GLB output,
scale/orientation/LOD application, and clean-profile package reuse require a
hardware-backed run.

**Gate:** VERIFIED NARROWLY — local preparation, policy gates, persistence,
state transitions, and emulated browser evidence passed; hardware-backed
provider inference and reusable reviewed GLB acceptance remain unverified.
