# ADR 0013 — Asset Library, Seed Catalog, and Providers (Phase 04)

**Status:** Accepted
**Date:** 2026-08-05
**Phase:** 04 (asset library, seed catalog, and providers)

## Context

The repo had a content-addressed store and minimal asset metadata, but no
asset domain, no local search, no license policy, no procedural templates, no
provider adapters, and no package attribution report. The pack requires a
reliable local-first equipment library where local search always runs before
external search and every packaged asset carries attribution.

## Decision

1. **`packages/assets` (new domain package)**: framework-independent asset
   metadata, a deterministic license policy engine (`decideLicense`), local
   full-text search (`searchAssets`/`tokenize`), and 19 procedural scientific
   equipment templates with a deterministic GLB writer (no Three.js
   dependency).
2. **License policy**: CC0 free; MIT/BSD/Apache/CC-BY require attribution;
   CC-BY-SA blocks embedding in public releases; GPL/AGPL/SSPL/BUSL and
   unknown licenses block embedding (fail closed).
3. **Local search first**: `searchAssets` ranks exact name > prefix > substring
   > alias > tag > semantic alias, with format filtering. It is the only
   > search path in the web library before any external provider (providers are
   > not yet wired to the network).
4. **Procedural templates**: 19 scientific templates (pipette, beaker, flask,
   peristaltic pump, balance proxy, workbench, …) generate deterministic GLB
   bytes marked as visual approximations (never dimensionally verified).
5. **Web asset library** (`assetLibrary.ts`): wraps the OPFS/content store +
   Dexie metadata with the domain — import GLB, add procedural templates,
   license-block display, attach-to-node from the scene editor.
6. **Package attribution report**: draft packages emit
   `reports/asset-licenses.json` listing hash, name, license, attribution, and
   source for every attributed asset (via `DraftPackageInput.attributions`).
7. **Path-safety hardening**: the fuzzer surfaced `".. "` (trailing-space
   segment) surviving `validatePackagePath`; segments are now trimmed before
   the parent/normalized check, and the property test asserts the correct
   segment-level invariant (filenames like `a..b` remain legal).

## Current official documentation

- Library/product: none new adopted — procedural GLB writer is hand-rolled
  (glTF 2.0 minimal), avoiding a Three.js runtime dependency in the domain.
- Primary source: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Verified date: 2026-08-05

## Alternatives

- Three.js-based procedural generation in the domain: rejected — domain
  packages cannot import Three.js (boundary + dep-check).
- External provider search wired to live APIs now: rejected — the sandbox has
  no network to Poly Haven/NIH 3D; adapters are scoped later (Phase 04 seed
  catalog + review queue are local-first). The provider _contract_ is
  represented by `AssetOrigin.kind: 'provider'`.

## Consequences

### Data and migration

- New `packages/assets` package; no persisted-format change (metadata lives in
  the existing Dexie `assets` table via spread).

### Security/privacy

- License policy fails closed on unknown licenses; attribution required for
  permissive licenses; public releases block share-alike embedding.
- `validatePackagePath` hardened against trailing-whitespace traversal.

### Browser/device

- Asset panel gains search + procedural seeds in the scene editor (works on
  iPad/iPhone emulation).

### Cost/performance

- Procedural GLB generation is deterministic and dependency-free; local
  search is O(n) over metadata.

### Licensing

- Procedural templates are CC0 (generated locally).

## Acceptance evidence

- `packages/assets`: 10/10 tests (search ranking, license policy incl.
  unknown/GPL/share-alike blocks, procedural GLB determinism).
- `packages/package-gforge`: 35/35 (attribution report emit/omit, hardened
  path property + `a..b` regression).
- `pnpm check --force`: 105/105.
- Playwright e2e: includes the new asset-library scene spec (procedural
  template appears + attaches).

## Revisit trigger

- Network access to a provider (Poly Haven/NIH 3D/…) becomes available: wire
  the `AssetOrigin.kind === 'provider'` path with search/download adapters
  and a review queue.
- STEP conversion via FreeCAD lands (companion worker): add the adapter seam.
