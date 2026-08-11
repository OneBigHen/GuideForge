# Phase 03 Report — Package v2, Storage, Backup, Recovery

## Outcome

Phase 03 is verified on implementation commit
`3f70f67e8c72662bb8a383162d41325df6721a00`. GuideForge now has a deterministic
`.gforge` v2 portability boundary, bounded archive restore, local-first
storage health and garbage collection, full evidence backup, and companion
signing-key custody with rotation and revocation.

This is a bounded production gate: the clean-profile restore is proven by the
current web/storage tests and browser emulation. A physical iPad/iPhone,
native OS keychain/enclave, and live provider-produced artifact are not proven
by this phase.

## Implemented slices

- Package v2 emits `guide.json`, content-addressed assets, canonical source
  metadata, optional source bytes, generation/validation/cost/license reports,
  and optional runtime evidence under a manifest-bound layout. The checked-in
  contract is `packages/package-gforge/schemas/PackageManifest.schema.json`.
- Import preflights ZIP central-directory metadata, validates safe relative
  paths, enforces entry/count/ratio/per-file/total expansion limits, then
  streams inflation with fflate. Active HTML content and non-HTTP(S) resource
  fields are rejected before persistence or rendering.
- Dexie migrations 5–7 add source blobs, package reports, and runtime blobs.
  OPFS remains the preferred asset store with an IndexedDB fallback; storage
  health reports persistence, quota estimates, near-limit state, and exposes
  list/remove/garbage-collection operations.
- Draft export fails closed on missing referenced bytes. Full backup includes
  execution evidence and runtime files. Restore verifies every asset hash,
  source/report inventory, evidence record, and runtime policy, then writes a
  restore/migration report.
- Companion signing uses Ed25519 material encrypted by the existing companion
  secret boundary. The browser receives public metadata only; authenticated
  owner routes rotate, sign, and revoke keys, deleting revoked private
  material.
- Settings exposes local-storage health/persistence controls and signing-key
  status. The editor exposes full-backup export.

## Exact evidence

| Check                                                                   | Result                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm --filter @guideforge/package-gforge test`                         | 38/38                                                                                        |
| `pnpm --filter @guideforge/storage-web test`                            | 7/7                                                                                          |
| `pnpm --filter @guideforge/web test`                                    | 24/24, including full backup restore                                                         |
| `pnpm --filter @guideforge/companion test`                              | 11/11, including signing rotation/revocation                                                 |
| `pnpm exec turbo run check --force --concurrency=2`                     | 120/120, 0 cached, 7m32.671s                                                                 |
| Local Playwright desktop/iPad/iPhone run                                | 46 passed, 2 expected skips                                                                  |
| GitHub check `93920393867`                                              | passed in 5m17s                                                                              |
| GitHub Playwright `93921864628`                                         | passed in 2m58s                                                                              |
| GitHub run `31533935448`                                                | passed for the implementation SHA                                                            |
| `pnpm boundary`, `pnpm dep-check`, policy, secret, audit, license, SBOM | passed; local secret scan used regex fallback, SBOM exited 0 with known npm tree diagnostics |

## Known limits

- Playwright device profiles are emulation, not physical Safari/Pencil or
  camera testing.
- Signing private material is protected by the companion’s encrypted 0600
  master-key boundary; native OS keychain/enclave integration remains a later
  release gate.
- Vite reports existing large-bundle warnings; CI reports existing Node 20
  action deprecation and Fast Refresh warnings.

**Gate: PASS — current-tree bounded package/storage/recovery evidence.**
