# ADR 0003 — Spatial Editor Architecture

**Status:** Accepted
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 04 — Spatial Editor

## Context

GuideForge needs a professional, procedure-focused 3D scene editor that works
on desktop browsers and iPad (touch/Pencil), with numeric/keyboard alternatives
for every drag, and never persists Three.js instances. The legacy prototype
mixed WebXR, device logic, and React state into one editor.

## Current official documentation

Verified via registry metadata on 2026-08-04 (versions already pinned in ADR 0001):

| Technology | Exact version |
|---|---|
| three | 0.185.1 |
| @react-three/fiber | 9.7.0 |
| @react-three/drei | 10.7.7 |
| @types/three | 0.185.1 |

## Decision

1. **Two-layer split**:
   - `packages/scene-core` — pure serializable scene entities (`SceneNode`,
     `SceneState`, cameras, measurements, layers), transform math (plain
     `Vec3`/`Quat` objects; no Three dependency), snapping (grid, angle),
     alignment/distribution/pivot helpers, step scene state, and
     `evaluateSceneHealth` with budget limits.
   - `packages/scene-react` — R3F adapter that *renders* `SceneState`:
     `Canvas` with `frameloop="demand"`, `TransformControls` gizmo, `Grid`,
     `OrbitControls`, GLB loading by content hash, context-loss handling.
2. **Scene mutations are commands**: `SCENE_COMMAND_TYPES` (add/remove node,
   set/numeric transform, visibility, lock, reparent, duplicate, rename,
   layer, add camera, align, distribute) applied by a pure reducer
   (`applySceneCommand`). Multiselect align/distribute are ONE command (one
   undo unit).
3. **Persistence**: a dedicated Dexie DB (`guideforge-scenes`) stores a
   JSON-serialized `SceneState` per guide. No Three.js objects are persisted.
4. **DOM alternative**: the hierarchy panel is the synchronized accessible
   DOM representation of the scene (name, visibility, selection state), and
   numeric transform fields are the non-drag alternative.
5. **Rendering rules**: demand rendering (invalidate on state/selection/tool
   change), DPR cap [1,2], WebGL context-lost → user-visible recovery notice.

## Alternatives considered

### Alternative A — Three.js scene graph as the source of truth

Benefits: direct manipulation. Risks: non-serializable, breaks Yjs/local-first
collaboration, device-specific. Rejected; `scene-core` is the source of truth.

### Alternative B — editor-ui owns all scene code

Benefits: simpler initially. Risks: device logic and React mixed in again.
Rejected; scene-react stays a thin renderer, editor-ui composes panels.

### Alternative C — store scene inside the Yjs guide document

Benefits: one doc. Risks: scene state is large/binary-ish and step-scoped;
guide edits and scene edits have different granularity. Accepted compromise:
scene lives in its own Dexie store keyed by guideId; future collab can add a
Yjs scene doc without changing `scene-core`.

## Consequences

### Positive

- Scene math fully unit/property tested without WebGL.
- Numeric fields + keyboard = every drag has an alternative (acceptance gate).
- Multiselect align/distribute undo as one semantic command.
- Demand rendering and health budgets are enforced.

### Negative

- Two storage systems (guide Yjs + scene Dexie) must stay in sync by guideId.
- R3F version coupling to three (peer-constrained, pinned).

### Security/privacy

- GLB assets loaded only via content-hash URL resolver; no remote URLs.
- Scene data is local; no telemetry of scene content.

### Browser/device

- WebGL2 required; fallback to DOM hierarchy works without WebGL (page still
  renders, viewport shows recovery message).

### Data migration

- Scene Dexie v1 schema; serialization is explicit and versioned via
  `SerializedScene`.

### Operations

- `pnpm check` covers scene-core tests (17), scene-react contract tests (2).

## Acceptance evidence

- `scene-core` property tests: command sequences never corrupt the scene;
  euler round-trip; snapping; alignment; distribution.
- Playwright scene e2e: add object → select → numeric transform → DOM
  hierarchy persists (desktop/ipad/iphone).

## Revisit trigger

- Add Yjs-backed collaborative scene documents (Phase 05+) without changing
  `scene-core`.
- Add GLB derivative generation (worker-media) and LODs later.
