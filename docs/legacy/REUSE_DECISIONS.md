# Reuse Decisions

Reference: `gsk-tech/Guides-Studio` @ `ef07a2708991a1cd1797f3e428b313b2f2570ec3`

Verdict per subsystem: **reuse** (behavioral knowledge only), **rewrite**
(new implementation, no code carry-over), **fixture-only** (cleaned data for
tests), or **discard**.

| Legacy subsystem | Verdict | Rationale |
|---|---|---|
| `.guide` TAR layout knowledge (flat archive, `Guide_Body`, `Model_Body_*`/`Image_Body_*`/`Video_Body_*`) | Reuse (knowledge) | Needed for `interop-ms-guide`; re-implemented with sandboxed bounded extraction |
| D365 `msmrw_*` field mappings | Reuse (mapping table) | Documented in `interop-ms-guide` adapter; canonical types stay framework-independent |
| Parser (`services/parser.ts`) | Rewrite | Unsafe unbounded TAR handling; needs version detection, loss reports, namespaced preservation |
| Exporter (`services/exporter.ts`) | Rewrite | Hard-coded tenant URI, dropped anchor, no loss report; only supported-subset export |
| Domain types (`types/index.ts`, `types/schemas.ts`) | Rewrite | D365-shaped mutable types replaced by canonical `GuideSnapshot`/entities in `guide-schema` + `domain` |
| `EditorGuide` whole-guide object | Discard | Replaced by normalized entities + Yjs working document + commands |
| `Map<string, Blob>` asset map | Discard | Replaced by SHA-256 `AssetReference` + OPFS/S3 |
| IndexedDB `guides`/`versions`/`assets` stores | Rewrite | Split into `y-indexeddb` (Yjs), Dexie (metadata), OPFS (assets) |
| `localDatabase.ts` dual-store fallback | Discard | No sync contract; replaced by explicit Yjs local/network states |
| Express/SQLite backend | Rewrite | Fastify + PostgreSQL + Drizzle per canonical stack |
| Bearer `VITE_API_KEY` auth | Discard | OIDC authorization code + PKCE + BFF session |
| Undo/redo concept | Reuse (concept) | Rebuilt as semantic command bus with grouped undo units |
| Snapshot version history | Discard | Command/audit history + Yjs updates + immutable signed releases |
| Scene editor (R3F) | Rewrite | Device-neutral `scene-core` + `scene-react` adapter; no XR mixing in editor |
| AR/XR components | Rewrite | `viewer-core` + device adapters; XR is release-viewer only |
| QR/anchor experiments | Rewrite | Re-derived from spatial spec; web-first anchors |
| `utils/deviceDetector.ts` (UA-based) | Discard | Capability profile detection |
| `utils/undoRedo.ts` deep-clone | Discard | Command bus with semantic grouping |
| `Sample_Guide.guide` | Fixture-only | Cleaned demo; candidate for `packages/test-fixtures` with provenance note |
| Tests | Rewrite | New Vitest + property tests + Playwright per acceptance matrix |
| CI (`ci.yml`) | Reuse (shape) | Ported/expanded: lockfile, lint, typecheck, tests, build, secret/ dep/ license/ SBOM gates |
| Docs (deployment, AR features, Windows bundle) | Discard | New docs per architecture; Windows portable bundle concept not carried |

## Rules enforced from here on

- No source code, assets, environment files, `.env*`, databases, uploads,
  certificates, or branding from the reference enter GuideForge `main`.
- Only *behavioral knowledge, mappings, and the cleaned fixture* (with
  provenance) may cross, and only through the designated packages
  (`interop-ms-guide`, `test-fixtures`).
- Every rewrite is built to the canonical architecture in
  `docs/UNIVERSAL_BUILD_SPEC.md`.
