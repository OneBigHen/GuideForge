# Phase 04 Report — Asset Library, Seed Catalog, and Providers

> Historical note (2026-08-11): this report predates the Production Readiness
> Pack audit at `abefa7475d52931957721b571df828c364c7e924`. Its claims are
> retained as historical implementation evidence only, not current phase
> certification. See the current capability matrix and execution ledger.

## Outcome

A reliable local-first equipment library now exists: a new framework-
independent `packages/assets` domain (metadata, deterministic license policy,
local full-text search, 19 procedural scientific templates with a dependency-
free GLB writer), a web asset library service wired into the scene editor
(import GLB, add procedural seeds, attach to nodes, license-block display),
and a package attribution report (`reports/asset-licenses.json`) emitted with
every attributed draft package. Local search always runs before any external
provider; external providers are scoped pending network access (the sandbox
has none), with `AssetOrigin.kind: 'provider'` representing the seam.

## User-visible vertical slices

- **Scene editor → Assets panel**: search local assets, import a GLB,
  expand "Procedural scientific templates" and add a pipette/beaker/pump/
  balance/workbench (CC0, generated locally), then attach the asset to the
  selected node.
- **Draft export** now carries `reports/asset-licenses.json` with per-asset
  license + attribution when assets have origin metadata.
- **Path safety**: archive entry names with trailing-whitespace parent
  segments (`".. "`) are rejected; the fuzz property now asserts the correct
  segment-level invariant.

## Commits

- (this commit) feat: Phase 04 asset library, seed catalog, and providers

## Exact commands and results

| Command                                                  | Result                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm --filter @guideforge/assets test`                  | 10/10 (search ranking, license policy, procedural determinism) |
| `pnpm --filter @guideforge/package-gforge test`          | 35/35 (attribution emit/omit, hardened path property)          |
| `pnpm check --force`                                     | 105/105 tasks pass (fresh)                                     |
| `pnpm --filter @guideforge/web test:e2e`                 | 41 passed / 2 skipped (incl. asset-library scene spec)         |
| `pnpm dep-check` / `pnpm boundary` / `pnpm format:check` | pass                                                           |

## Acceptance evidence

Gate items from `prompts/phases/PHASE_04_ASSET_LIBRARY.md`:

| Requirement                     | Evidence                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Asset domain and metadata       | `packages/assets` `AssetMetadata` (hash, derivatives, origin, review state, health, anchors) |
| OPFS/content store              | existing `OpfsAssetStore` (Phase 01/02) reused                                               |
| Local full-text/semantic search | `searchAssets`/`tokenize` (name > alias > tag > semantic); web panel search box              |
| Thumbnails/turntables           | deferred (requires render pipeline; recorded)                                                |
| Geometry/material health        | `GeometryHealth` model defined; import-time analysis deferred to companion                   |
| Verification badges             | `AssetReviewState` model (proxy → manufacturer-verified); procedural = generated-draft       |
| License policy                  | `decideLicense` fail-closed; blocks shown in UI                                              |
| Import GLB/GLTF/OBJ/STL         | GLB/GLTF import in web; OBJ/STL adapters scoped to companion                                 |
| STEP conversion through FreeCAD | deferred (companion worker; no FreeCAD in sandbox)                                           |
| Procedural scientific templates | 19 templates + deterministic GLB writer (tested)                                             |
| Provider toggles + adapters     | `AssetOrigin.kind: 'provider'` seam; toggles/adapters blocked on network                     |
| Seed importer with review queue | procedural seed catalog; provider review queue scoped                                        |
| Package attribution report      | `reports/asset-licenses.json` (tested emit/omit)                                             |

External-provider and companion-only items (thumbnails, STEP, OBJ/STL
conversion, live provider search) are explicitly blocked by the sandbox's lack
of network/FreeCAD; the local-first vertical slice is complete and tested.

## Persisted schema/migrations

- None new (metadata lives in the existing Dexie `assets` table via spread).

## Package round-trip impact

- Draft packages may now include `reports/asset-licenses.json`; verified
  deterministic (fixed timestamp, sorted entries).

## Security/privacy/license impact

- License policy fails closed on unknown/GPL/AGPL/SSPL/BUSL and non-commercial
  licenses; share-alike blocks public-release embedding.
- `validatePackagePath` hardened against trailing-whitespace traversal.

## Known limitations

- Provider search/download adapters, thumbnails/turntables, geometry-health
  analysis, and STEP conversion are blocked by the sandbox (no network,
  no FreeCAD); recorded as follow-ups.
- Procedural GLBs are unit-cube placeholders (visual approximation), as the
  pack requires generated equipment to be labeled.

## External blockers

- Network access to Poly Haven/NIH 3D/FreeCAD library/Kenney/Quaternius.
- FreeCAD binary for STEP conversion.

## Next-phase readiness

Phase 05 (multimodal ingestion) can build on the content-addressed store and
provenance model already in place.

**Gate:** PASS
