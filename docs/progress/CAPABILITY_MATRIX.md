# GuideForge Capability Matrix — Truth Baseline (Phase 00)

Audited commit: `5d9a1d2962698506f675e8eb3c1e7337ccfd62a7` (current HEAD at branch creation)
Audit date: 2026-08-05
Source: source inspection of `apps/`, `packages/`, `services/`, `.github/workflows/ci.yml`

Status legend:

- `verified` — implemented and proven by tests in the current tree
- `experimental` — implemented, minimal evidence
- `partial` — implemented but incomplete primary path
- `blocked` — cannot complete in this environment
- `missing` — not implemented

## Baseline

| Capability                                  |          Implemented | Unit | Integration |         E2E | Real device | Status      | Evidence                                                                              |
| ------------------------------------------- | -------------------: | ---: | ----------: | ----------: | ----------: | ----------- | ------------------------------------------------------------------------------------- |
| pnpm/Turborepo monorepo with pinned catalog |                  yes |    — |           — |           — |           — | verified    | pnpm-workspace.yaml catalog pins; turbo.json                                          |
| Strict TypeScript                           |                  yes |    — |           — |           — |           — | verified    | tsconfig.base.json strict                                                             |
| CI runs Playwright E2E                      |               **no** |    — |           — | yes (local) |           — | **missing** | `.github/workflows/ci.yml` has no e2e step; `apps/web/package.json` `test:e2e` unused |
| CI integration services (Postgres)          |               **no** |    — | yes (local) |           — |           — | **missing** | no `services:` in ci.yml; `apps/api/src/index.test.ts` needs Postgres                 |
| Audit/license/SBOM blocking policy          |               **no** |    — |           — |           — |           — | **missing** | all three steps `\|\| true` in ci.yml:73-80                                           |
| Secret scanning                             | yes (regex fallback) |    — |           — |           — |           — | partial     | ci.yml:62-71 regex; gitleaks never installed                                          |
| Capability matrix truthful                  |                    — |    — |           — |           — |           — | partial     | old reports ahead of implementation (audit finding)                                   |
| Clean frozen install                        |                  yes |    — |           — |           — |           — | verified    | `pnpm install --frozen-lockfile` (Phase 00 re-run)                                    |

## Single-user security / control plane

| Capability                                                                      |      Implemented | Unit | Integration | E2E | Status      | Evidence                                                                            |
| ------------------------------------------------------------------------------- | ---------------: | ---: | ----------: | --: | ----------- | ----------------------------------------------------------------------------------- |
| No body-supplied roles                                                          |           **no** |    — |           — |   — | **missing** | `apps/api/src/index.ts:88-93` reads `roles` from body                               |
| Loopback default companion                                                      |           **no** |    — |           — |   — | **missing** | `apps/companion` does not exist                                                     |
| LAN/network owner auth (Argon2id, session, CSRF, origin allowlist, rate limits) |           **no** |    — |           — |   — | **missing** | JWT cookie session only; no CSRF/origin/rate-limit                                  |
| Provider keys never in browser                                                  |              yes |    — |           — |   — | verified    | keys server-side; but browser fallback fake exists                                  |
| Signing key never in localStorage                                               |           **no** |    — |           — |   — | **missing** | `apps/web/src/services/guideStore.ts:495-502` Ed25519 private key in localStorage   |
| Real SHA-256 content identity                                                   | **no** (partial) |    — |           — |   — | **missing** | FNV-1a padded to 64 hex in api `fnvHex`, ms-guide `hashBytes`, web `aiProposals.ts` |
| Deep model-output validation                                                    |          partial |    — |           — |   — | partial     | `isExtractionOutput` shallow; zero-citation allowed                                 |
| Constructor API key used by adapters                                            |           **no** |    — |           — |   — | **missing** | `DeepSeekAdapter.configApiKey()` ignores constructor key (model-gateway:306-310)    |
| Proposals retain citations + receipt                                            |          partial |    — |           — |   — | partial     | server drops full citations; browser stores without citations/source identity       |
| Provider/fallback explicit in UI                                                |           **no** |    — |           — |   — | **missing** | silent fallback to FakeModelAdapter                                                 |
| Rate limits and cancellation                                                    |          partial |    — |           — |   — | partial     | docling timeout exists; no job-level rate limits                                    |
| Approval content-hash invalidation                                              |           **no** |    — |           — |   — | **missing** | api:190-194 stub, no live Yjs hash                                                  |
| Audit org IDs deterministic                                                     |           **no** |    — |           — |   — | **missing** | `crypto.randomUUID()` per audit event                                               |
| Bounded archive extraction (no sync unzip)                                      |           **no** |    — |           — |   — | **missing** | `fflate.unzipSync` sync in guideStore.ts:476, release.ts:166                        |

## Canonical guide / package

| Capability                                | Implemented | Unit | Integration | E2E | Status      | Evidence                                                      |
| ----------------------------------------- | ----------: | ---: | ----------: | --: | ----------- | ------------------------------------------------------------- |
| Scene in canonical Yjs/snapshot           |      **no** |    — |           — |   — | **missing** | Dexie `guideforge-scenes` authoritative (sceneStore.ts:26-29) |
| Training in canonical Yjs/snapshot        |      **no** |    — |           — |   — | **missing** | no training structures anywhere in packages                   |
| Assets content-addressed (OPFS)           |         yes |  yes |           — |   — | verified    | storage-web OpfsAssetStore SHA-256 keys                       |
| Package contains all referenced assets    |      **no** |    — |           — |   — | **missing** | `assets: new Map()` passed at export (guideStore.ts:437,508)  |
| Package deterministic draft               |         yes |  yes |           — |   — | verified    | package-gforge fixed timestamps, sorted entries, level 0      |
| Signed release with real manifest binding |         yes |  yes |           — |   — | verified    | package-gforge signing.ts + release.ts                        |
| Another browser imports identical state   |      **no** |    — |           — |   — | **missing** | no full snapshot scene/training import path                   |
| Semantic round-trip comparison            |      **no** |    — |           — |   — | **missing** | not implemented                                               |

## Ingestion

| Capability                        | Implemented | Unit | Integration | E2E | Status   | Evidence                                                                   |
| --------------------------------- | ----------: | ---: | ----------: | --: | -------- | -------------------------------------------------------------------------- |
| Digital PDF / Docling             |     partial |    — | yes (local) |   — | partial  | apps/worker-documents DoclingConverter (real, verified live); not deployed |
| Scanned PDF OCR / VLM fallback    |      **no** |    — |           — |   — | missing  | do_ocr=False; no VLM                                                       |
| Tables / figures / bounding boxes |      **no** |    — |           — |   — | missing  | docling bridge disables table structure                                    |
| DOCX/PPTX/XLSX                    |      **no** |    — |           — |   — | missing  | not implemented                                                            |
| Audio/video ASR                   |      **no** |    — |           — |   — | missing  | worker-media empty                                                         |
| Source studio UI                  |      **no** |    — |           — |   — | missing  | no ingestion UI in web                                                     |
| Stable region IDs                 |      **no** |    — |           — |   — | missing  | not implemented                                                            |
| Prompt-injection fixtures         |         yes |  yes |           — |   — | verified | Phase 06 injection tests                                                   |
| Cancellation/partial results      |     partial |    — |           — |   — | partial  | docling timeout only                                                       |

## AI

| Capability                          | Implemented | Unit | Integration | E2E | Status  | Evidence                                                      |
| ----------------------------------- | ----------: | ---: | ----------: | --: | ------- | ------------------------------------------------------------- |
| Real SHA-256                        |     partial |  yes |           — |   — | partial | package/storage real; api/ms-guide/web padded FNV             |
| Deep runtime schema validation      |     partial |  yes |           — |   — | partial | shallow guard                                                 |
| Zero-citation steps rejected        |      **no** |    — |           — |   — | missing | gateway allows zero-citation steps                            |
| Proposals retain citations/receipts |      **no** |    — |           — |   — | missing | lost server→browser                                           |
| Provider/fallback visible           |      **no** |    — |           — |   — | missing | silent fake fallback                                          |
| Bounded repair                      |      **no** |    — |           — |   — | missing | not implemented                                               |
| Per-job cost limits                 |      **no** |    — |           — |   — | missing | not implemented                                               |
| Cost profiles (fast-structure etc.) |      **no** |    — |           — |   — | missing | model names scattered                                         |
| No fake in primary paths            |      **no** |    — |           — |   — | missing | FakeModelAdapter default when no key; `generateFakeProposals` |

## Spatial editor

| Capability                   |              Implemented | Unit | Integration | E2E | Status   | Evidence                                              |
| ---------------------------- | -----------------------: | ---: | ----------: | --: | -------- | ----------------------------------------------------- |
| 3D viewport (R3F)            |                      yes |    — |           — | yes | verified | scene-react SceneViewport; e2e scene.spec             |
| Hierarchy tree + reparent    |                      yes |    — |           — |   — | partial  | buildHierarchy + reparent reducer; no UI for some ops |
| Multiselect                  |                  partial |    — |           — |   — | partial  | reducer has multiselect; UI incomplete                |
| Translate/rotate/scale gizmo |                      yes |    — |           — | yes | verified | TransformControls                                     |
| Numeric controls             |                      yes |    — |           — |   — | verified | inspector position/scale                              |
| Local/world toggle           |                      yes |    — |           — |   — | verified | scene page                                            |
| Snapping (all axes)          |                  partial |  yes |           — |   — | partial  | scene-core snap math; UI grid snap                    |
| Align/distribute             |                  partial |  yes |           — |   — | partial  | Y only (Align(Y)/Distribute(Y))                       |
| Pivot control                |                   **no** |    — |           — |   — | missing  | —                                                     |
| Visibility/lock/isolate      |                  partial |    — |           — |   — | partial  | hide/lock in hierarchy; no isolate                    |
| Layer UI                     |                   **no** |    — |           — |   — | missing  | data model only                                       |
| Camera bookmarks UI          |                   **no** |    — |           — |   — | missing  | data model + reducer only                             |
| Step cameras                 |                   **no** |    — |           — |   — | missing  | —                                                     |
| Measurement UI               |                   **no** |    — |           — |   — | missing  | data model only                                       |
| Step scene states            |                   **no** |    — |           — |   — | missing  | —                                                     |
| Annotations                  |                   **no** |    — |           — |   — | missing  | zero matches repo-wide                                |
| Undo/redo                    | yes (guide) / no (scene) |  yes |           — |   — | partial  | collaboration undo manager; scene none                |
| Keyboard shortcuts           |                  partial |    — |           — |   — | partial  | gizmo shortcuts; no palette                           |
| Touch/Pencil controller      |                   **no** |    — |           — |   — | missing  | —                                                     |
| Demand rendering             |                      yes |    — |           — |   — | verified | frameloop="demand"                                    |
| Context-loss recovery        |                   **no** |    — |           — |   — | missing  | —                                                     |
| Scene health                 |                   **no** |    — |           — |   — | missing  | —                                                     |
| DOM alternative to drag      |                   **no** |    — |           — |   — | missing  | —                                                     |

## Assets / providers

| Capability                                | Implemented | Unit | Integration | E2E | Status   | Evidence                                        |
| ----------------------------------------- | ----------: | ---: | ----------: | --: | -------- | ----------------------------------------------- |
| Asset domain/metadata                     |     partial |    — |           — |   — | partial  | storage-web assets tables; scene AssetReference |
| OPFS content store                        |         yes |  yes |           — |   — | verified | OpfsAssetStore                                  |
| Local search                              |      **no** |    — |           — |   — | missing  | —                                               |
| Thumbnails/turntables                     |      **no** |    — |           — |   — | missing  | —                                               |
| Geometry/material health                  |      **no** |    — |           — |   — | missing  | —                                               |
| License policy engine                     |      **no** |    — |           — |   — | missing  | not implemented                                 |
| GLB import UI                             |      **no** |    — |           — |   — | missing  | asset resolver always empty map                 |
| GLTF/OBJ/STL/STEP                         |      **no** |    — |           — |   — | missing  | —                                               |
| Procedural scientific templates           |      **no** |    — |           — |   — | missing  | —                                               |
| Provider adapters (Poly Haven, NIH, etc.) |      **no** |    — |           — |   — | missing  | —                                               |
| Package attribution report                |      **no** |    — |           — |   — | missing  | —                                               |

## Training

| Capability                         | Implemented | Unit | Integration | E2E | Status  | Evidence                               |
| ---------------------------------- | ----------: | ---: | ----------: | --: | ------- | -------------------------------------- |
| Objectives/competencies/modules    |      **no** |    — |           — |   — | missing | no training structures                 |
| Assessments + rationales           |      **no** |    — |           — |   — | missing | —                                      |
| Mastery policy                     |      **no** |    — |           — |   — | missing | —                                      |
| Remediation                        |      **no** |    — |           — |   — | missing | —                                      |
| Player (learn/practice/assessment) |      **no** |    — |           — |   — | missing | run player only (no scoring)           |
| Attempt ledger/evidence            |     partial |    — |           — |   — | partial | evidence table + run page demo capture |
| xAPI/QTI export                    |      **no** |    — |           — |   — | missing | —                                      |

## Photo-to-3D / spatial intelligence

| Capability                      | Implemented | Unit | Integration | E2E | Status  | Evidence |
| ------------------------------- | ----------: | ---: | ----------: | --: | ------- | -------- |
| Photo capture wizard            |      **no** |    — |           — |   — | missing | —        |
| EXIF removal                    |      **no** |    — |           — |   — | missing | —        |
| Hunyuan/TripoSR adapters        |      **no** |    — |           — |   — | missing | —        |
| Blender cleanup                 |      **no** |    — |           — |   — | missing | —        |
| Semantic anchors                |      **no** |    — |           — |   — | missing | —        |
| Arrows/labels/callouts          |      **no** |    — |           — |   — | missing | —        |
| Deterministic constraint solver |      **no** |    — |           — |   — | missing | —        |
| Camera director                 |      **no** |    — |           — |   — | missing | —        |

## Devices / PWA

| Capability                    |  Implemented | Unit | Integration | E2E | Status       | Evidence                       |
| ----------------------------- | -----------: | ---: | ----------: | --: | ------------ | ------------------------------ |
| PWA offline shell             |          yes |    — |           — | yes | verified     | workbox precache; offline.spec |
| Service-worker update flow    |          yes |    — |           — | yes | verified     | sw.ts + update banner          |
| Desktop browser full creation |      partial |    — |           — | yes | verified     | editor + release e2e           |
| iPad emulation E2E            |          yes |    — |           — | yes | —            | playwright ipad project        |
| iPhone emulation E2E          |          yes |    — |           — | yes | —            | playwright iphone project      |
| Real-device runbook           |       **no** |    — |           — |   — | blocked      | no physical device in sandbox  |
| Tauri wrapper thin            |          yes |    — |           — |   — | verified     | desktop src-tauri              |
| xr-web viewer                 | experimental |    — |           — |   — | experimental | separate app, not linked       |

## Summary of verified gaps requiring repair before major AI features

1. No body-supplied roles → remove organization/roles from primary session path (Phase 01)
2. Real SHA-256 everywhere content hash claimed (api, ms-guide, web aiProposals)
3. Constructor-provided API keys actually used by adapters
4. Deep runtime validation + zero-citation rejection
5. Proposals retain source hash, citations, confidence, receipt
6. No silent fallback real→fake; provider status explicit in UI
7. No random org IDs in audit; approval content-hash invalidation implemented
8. No signing keys in localStorage
9. No empty asset maps in export; scene not authoritative in separate Dexie
10. No unbounded synchronous unzip
11. CI runs Playwright + integration services; audit/license/SBOM blocking
12. Draft export button produces actual download
13. Truthful capability claims
