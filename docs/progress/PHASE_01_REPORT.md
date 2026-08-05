# Phase 01 Report — Single-User Architecture and Correctness Repairs

## Outcome

The enterprise-shaped control plane is now an honest single-owner companion:
roles can no longer be self-assigned from the request body, audit context is a
stable single-owner constant, approval invalidation is real, every claimed
content hash is real SHA-256, adapters honor their constructor keys, model
output is deeply validated and zero-citation output is rejected, proposals
retain citations + provider receipts, provider/fallback is explicit in the UI,
signing keys never enter the browser, archive extraction is bounded before
inflation, and the API has CSRF/rate-limit/loopback-default hardening.

## User-visible vertical slices

- **Proposals panel** now labels each proposal's producing provider
  ("DeepSeek (live)" vs "offline deterministic") and shows citation counts —
  the user always knows whether a real provider ran.
- **"Export .gforge"** (draft) now actually downloads a file (previously
  discarded).
- **"Export personal release"** is explicitly unsigned with an honest note —
  no more fake demo signing keys in localStorage.
- **Footer status** probes the companion and reports "Browser-only mode — no
  companion" / "Companion connected" truthfully.
- **Hierarchy row actions** (hide/show) act on the correct row (stale-selection
  bug fixed).

## Commits

- (this commit) feat: Phase 01 single-user repairs — owner session, SHA-256,
  validation, provenance, bounded unzip, unsigned releases

## Exact commands and results

| Command                                                  | Result                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @guideforge/api test`                     | 17/17 (7 new: body-roles ignored, owner enforcement, stable audit org, approval invalidation, CSRF, rate limit) |
| `pnpm --filter @guideforge/model-gateway test`           | 13/13 (constructor-key retention ×2, zero-citation rejection, no-credential ×3)                                 |
| `pnpm --filter @guideforge/package-gforge test`          | 32/32 (unsigned release, preflight zip-bomb/traversal/EOCD)                                                     |
| `pnpm --filter @guideforge/domain test`                  | 7/7 (SHA-256 FIPS vectors)                                                                                      |
| `pnpm --filter @guideforge/ai-contracts test`            | 17/17 (deep extraction validation)                                                                              |
| `pnpm --filter @guideforge/web test`                     | 8/8 (proposal provenance retention)                                                                             |
| `pnpm check --force`                                     | 100/100 tasks pass (fresh)                                                                                      |
| `pnpm --filter @guideforge/web test:e2e`                 | 37 passed / 2 skipped (WebKit offline)                                                                          |
| `pnpm dep-check` / `pnpm boundary` / `pnpm format:check` | pass                                                                                                            |

## Acceptance evidence

Gate items from `prompts/phases/PHASE_01_SINGLE_USER_REPAIRS.md`:

| Gate                                                | Evidence                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| No caller can grant privileges through request body | body-supplied-role regression test; `GET /api/session` shows server-derived owner role |
| Network companion is not usable anonymously         | `ownerId` enforcement test (non-owner 403)                                             |
| All claimed hashes are SHA-256                      | domain FIPS vectors; FNV removed from api/interop/gateway/package/web                  |
| Invalid/uncited model output is rejected            | deep `isExtractionOutput`; zero-citation step rejection test                           |
| Package import is bounded                           | `preflightZipArchive` (entry count, sizes, ratio) before inflation                     |
| Signing keys are protected                          | unsigned personal releases; no localStorage key anywhere                               |
| Known audit findings have regression tests          | 7 new api tests + gateway/package/web tests above                                      |

## AI/provider evidence

- Real SHA-256 source hashes, citations, confidence, and full provider receipt
  now flow server → proposal → persisted record → UI.
- No-credential behavior proven (gateway reports explicit unavailability).

## Device evidence

- E2E desktop/iPad/iPhone emulation: 37 passed / 2 skipped (WebKit offline).
- Real-device remains an external blocker.

## Accessibility evidence

- Axe scans still pass in E2E; provider badge + citations are text content.

## Security/privacy/license impact

- CSRF Origin check + rate limits + loopback default (server.ts).
- No signing secret in browser storage; unsigned releases verify as
  untrusted with a visible warning.
- `@noble/hashes` 2.2.0 (MIT) added to catalog for real SHA-256.

## Persisted schema/migrations

- Dexie `guideforge` DB: version 3 adds `citations` + `receipt` to proposals
  (additive, same indexes).

## Package round-trip impact

- Release manifest now carries `signed: false` for unsigned personal
  releases; verification accepts them (valid but untrusted).

## Performance and cost

- Preflight is metadata-only; no measurable cost.

## Known limitations

- Rate limits are in-memory (per-process); a multi-instance deployment would
  need a shared store. Single-user companion is fine.
- Signed releases still require the companion key store (Phase 07+); browser
  path is unsigned by design.
- Zip extraction is still synchronous after preflight; worker-based
  extraction remains a Phase 02/05 hardening item.

## External blockers

- Real-device (Safari/Pencil/camera) testing cannot run in this sandbox.

## Next-phase readiness

Phase 02 (canonical spatial guide + complete `.gforge`) can start: scene and
training are still outside the canonical Yjs/snapshot, assets are still passed
as empty maps, and Dexie remains authoritative for scenes — all Phase 02
targets.

**Gate:** PASS
