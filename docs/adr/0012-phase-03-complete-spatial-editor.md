# ADR 0012 — Complete Spatial Editor (Phase 03)

**Status:** Accepted
**Date:** 2026-08-05
**Phase:** 03 (complete spatial editor)

## Context

The scene editor was a proxy-cube prototype: no connected asset browser, no
undo/redo, Y-only align/distribute, no isolate, no layer/camera/annotation UI,
no keyboard shortcuts, and no context-loss recovery. The pack requires a
capable web/iPad editor where every drag has a non-drag alternative and
spatial edits survive the package round trip.

## Decision

Built on the Phase 02 canonical `GuideScene`, the scene page now provides:

1. **Connected asset browser**: lists content-addressed assets from Dexie,
   imports GLB/GLTF into the OPFS/content store, and attaches an asset hash to
   the selected node via the new `scene/set-asset` command.
2. **All-axis align/distribute**: X/Y/Z selector; `alignSelected` /
   `distributeSelected` use the chosen axis.
3. **Isolate**: hides every node except the selection; toggle restores.
4. **Layer UI**: list layers, create layers (`scene/add-layer`), assign
   selected nodes to a layer (`scene/set-layer`).
5. **Camera bookmarks UI**: add bookmark (`scene/add-camera`), list with
   coordinates.
6. **Annotation UI**: add/remove labels targeting the selected node
   (`scene/add-annotation`, `scene/remove-annotation`); scene-core `SceneState`
   and the canonical `GuideScene` both carry annotations now.
7. **Undo/redo**: scene-level history stacks, applied as semantic whole-scene
   commits to the working doc (non-drag, keyboard: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z,
   Cmd/Ctrl+Y).
8. **Keyboard shortcuts**: W/E/R transform modes, Delete/Backspace delete,
   I isolate — each maps to the same command as its button.
9. **Context-loss recovery**: WebGL context loss remounts the canvas after a
   short delay (demand rendering already exists).
10. **DOM alternatives**: hierarchy tree, numeric inspector, and every new
    panel are keyboard/screen-reader accessible.

New scene-core commands: `scene/add-layer`, `scene/set-asset`,
`scene/add-annotation`, `scene/remove-annotation`.

## Current official documentation

- Library/product: React Three Fiber — demand rendering + context-loss
  recovery patterns
- Exact version: catalog (see pnpm-workspace.yaml)
- Primary source: https://docs.pmnd.rs/react-three-fiber
- Verified date: 2026-08-05

## Alternatives

- Per-node CRDT mapping for scene in Yjs: rejected for this phase — whole-scene
  JSON commits are correct and simple; per-node granularity is a later
  refinement (noted in Phase 02).
- External scene library: rejected — `scene-core` + R3F already cover the
  needs.

## Consequences

### Data and migration

- `SceneState` gains `annotations` (empty default); canonical `GuideScene`
  already had them. No schema bump needed (v2 already defines annotations).

### Security/privacy

- Asset import is user-initiated and content-addressed; no new trust surface.

### Browser/device

- iPad touch/Pencil works through the existing pointer handling; every new
  action has a DOM/numeric alternative for keyboard and switch users.

### Cost/performance

- Undo/redo keeps two small stacks; scene JSON commits are bounded.

### Licensing

- None.

## Acceptance evidence

- `pnpm --filter @guideforge/scene-core test`: 19/19 (annotations, layers,
  set-asset, all-axis align).
- `pnpm check --force`: 100/100.
- Playwright e2e: 40 passed / 2 skipped, including the new
  `e2e/scene03.spec.ts` (undo/redo, layers, cameras, annotations, W shortcut)
  on desktop + iPad + iPhone.

## Revisit trigger

- Step scene states and animation intents become interactive (Phase 10) —
  `GuideScene.stepStates` gains UI.
