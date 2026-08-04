# Legacy Behavior Inventory

Reference: `gsk-tech/Guides-Studio` @ `ef07a2708991a1cd1797f3e428b313b2f2570ec3`
(worktree: `~/Vibe/Guides-Studio-reference`, read-only)

## 1. Application surface

| Subsystem             | Paths                                                                                                                            | LOC (approx)            | Notes                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| App shell/routing     | `App.tsx`, `index.tsx`, `components/common/Router.tsx`                                                                           | —                       | `BrowserRouter`/`HashRouter` switch (HashRouter for `file:` protocol); routes `/`, `/edit/:guideId`, `/view/:guideId` |
| Editor                | `components/Editor.tsx`, `components/features/editor/*`                                                                          | 11,304 (all components) | Whole-guide `EditorGuide` React state; panels: outline, properties, step, scene, anchor                               |
| Scene editor          | `components/features/editor/SceneEditor.tsx`, `SceneObjects.tsx`, `GLTFModel.tsx`, `ProceduralModel.tsx`, `SelectionOutline.tsx` | —                       | R3F Canvas, OrbitControls, Grid, PerspectiveCamera, XR/Controllers                                                    |
| AR/XR                 | `components/ARViewer.tsx`, `ARViewerEnhanced.tsx`, `components/ar/*`, `components/common/VR*.tsx`                                | —                       | WebXR AR/VR experiments, QR image tracking, Magic Leap/Quest experiments, gesture handling                            |
| Library               | `components/features/library/*`                                                                                                  | —                       | Guide list, asset panel, import dialog                                                                                |
| Domain types          | `types/index.ts`, `types/schemas.ts`                                                                                             | 241                     | D365-style entities (`msmrw_*`) + editor types                                                                        |
| Parser                | `services/parser.ts`                                                                                                             | —                       | `js-untar` TAR parse of `.guide`, `Guide_Body` JSON, asset extraction                                                 |
| Exporter              | `services/exporter.ts`                                                                                                           | —                       | Manual TAR generation, D365-shaped JSON                                                                               |
| Persistence (browser) | `services/db.ts`, `services/localDatabase.ts`                                                                                    | —                       | IndexedDB stores: guides, versions, assets; fallback client for backend                                               |
| Backend               | `backend/*`                                                                                                                      | 1,160                   | Express + SQLite (`better-sqlite3`), bearer API-key auth, multer uploads                                              |
| Utilities             | `utils/*` (blobManager, undoRedo, guideSerializer, deviceDetector, qrAnchorGenerator, gestureRecognizer, excelExporter, etc.)    | 3,006                   | Blob URL lifecycle, deep-clone undo/redo, LZ compression, UA device detection                                         |
| Tests                 | `test/*.ts`                                                                                                                      | 293                     | Vitest: parser, exporter, hooks, router, real `.guide` fixture                                                        |
| CI                    | `.github/workflows/ci.yml`                                                                                                       | —                       | npm ci + audit, tsc, vitest, build                                                                                    |
| Docs                  | `docs/*`, `README.md`, `guide_format_spec.md`, `CLAUDE.md`                                                                       | —                       | Deployment, AR features, controlled Windows bundle, API docs                                                          |

## 2. Useful behavior worth preserving (behavioral reference)

- `.guide` (TAR) layout knowledge: flat archive, `Guide_Body` JSON, `Model_Body_*` / `Image_Body_*` / `Video_Body_*` asset naming, thumbnail suffixes.
- D365 `msmrw_*` entity field mapping for tasks, steps, step objects, placements (quaternion rotation), anchor reference.
- Task → step → step-object → placement hierarchy.
- IndexedDB store separation concept (guides / versions / assets).
- Command-style undo/redo _concept_ (deep-clone based; see problems).
- Thumbnail/preview extraction concept (`:thumb` keys).
- QR/anchor association experiment (to be re-derived from spec, not code).

## 3. Architecture problems confirmed (must NOT reproduce)

| Problem                                | Evidence                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dual persistence without sync contract | `services/localDatabase.ts`: backend health probe falls back silently to IndexedDB; no version vectors, merge, or authority                                          |
| Shared frontend API key                | `.env.example`: `VITE_API_KEY`; `services/localDatabase.ts:34` `const API_KEY = (import.meta as any).env?.VITE_API_KEY`; `backend/middleware/auth.js` bearer compare |
| Mutable whole-guide object             | `types/index.ts:55` `assets: Map<string, Blob>`; `EditorGuide` nested mutable; `utils/undoRedo.ts` deep-clone snapshots                                              |
| Snapshot versioning                    | `components/VersionHistoryPanel.tsx` loads saved versions by id; `services/db.ts` `versions` store                                                                   |
| Hard-coded Dataverse URI               | `services/exporter.ts:167` `GuideUri: https://orga2a95488.crm.dynamics.com/api/data/v9.0/msmrw_guides(...)`                                                          |
| Anchor export dropped/hard-coded       | exporter writes `_msmrw_anchor3dobject_value: guide.anchorObjectId ?? null`                                                                                          |
| Device/editor mixing                   | `SceneEditor.tsx` mixes XR controllers + desktop controls; `deviceDetector.ts` UA-based                                                                              |
| Feature claims ahead of evidence       | README/docs claim production readiness; no device/security acceptance matrix                                                                                         |

## 4. Fixtures (legally usable, cleaned)

- `Sample_Guide.guide` (19 MB TAR): scrubbed demo ("Andrew+ Pipetting Robot Guide"), tenant URL replaced with `contoso` (verified via `scripts/clean_sample_guide.py` and inspection). Suitable as a fixture-only interop reference; not to be copied into GuideForge `main` without reuse review.

## 5. Tests and CI

- Vitest unit tests (parser, exporter, hooks, router, real-guide import).
- CI: `npm ci --no-audit --no-fund`, `npm audit --audit-level=high`, `tsc --noEmit`, `vitest run`, `npm run build`.
- No Playwright, no property tests, no accessibility tests.
