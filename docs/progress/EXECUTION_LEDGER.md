# GuideForge Execution Ledger — Current Production Run

Status values: `planned` / `active` / `blocked` / `verified` / `rejected` /
`superseded`. Old phase reports are historical evidence and do not set a
current status.

| ID    | Phase | User outcome                                                       | Status            | Current evidence                                                                                                                                                                                                                                                                                                                                                               | Follow-up                                                                          |
| ----- | ----- | ------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| P00-1 | 00    | Pack extracted, binding instructions read, exact branch identified | verified          | `/root/Vibe/GuideForge`, branch and parent SHA recorded in `PHASE_00_REPORT.md`                                                                                                                                                                                                                                                                                                | current-SHA PR                                                                     |
| P00-2 | 00    | Clean reproducible install                                         | verified          | `pnpm install --frozen-lockfile`: 24 workspaces / 930 packages                                                                                                                                                                                                                                                                                                                 | retain lockfile                                                                    |
| P00-3 | 00    | Forced repository check with real Postgres                         | verified          | `pnpm check --force`: 115/115; API 17/17; DB readiness read back                                                                                                                                                                                                                                                                                                               | keep DB service live in CI                                                         |
| P00-4 | 00    | Package, source, proposal, and execution probes run                | verified/partial  | package 35/35; web targeted 9/9; vertical-slice E2E; source materialization and real execution gaps recorded                                                                                                                                                                                                                                                                   | Phase 01/02/12                                                                     |
| P00-5 | 00    | Browser suite deterministic across emulated device profiles        | verified locally  | 43 passed / 2 skips; worker cap fixed WebGL actionability flake                                                                                                                                                                                                                                                                                                                | GitHub E2E                                                                         |
| P00-6 | 00    | Supply-chain and repository policy gates are blocking              | verified locally  | audit, license, SBOM, secret, policy, boundary, dependency checks pass                                                                                                                                                                                                                                                                                                         | GitHub job                                                                         |
| P00-7 | 00    | Capability matrix and ledger reflect current truth                 | verified          | current matrix/ledger rewritten; Phase 01–08 reports marked historical                                                                                                                                                                                                                                                                                                         | update after CI                                                                    |
| P00-8 | 00    | Current SHA has external CI evidence                               | verified          | PR #1 required check and E2E passed for `8b97360`; GitGuardian remains pending as third-party advisory                                                                                                                                                                                                                                                                         | monitor external advisory                                                          |
| P01   | 01    | Single-owner companion auth and secret boundary                    | verified          | `b6ec6b8` pushed; GitHub run `31498373276` passed `check` and Playwright desktop/iPad/iPhone; local 10/10 security tests                                                                                                                                                                                                                                                       | proceed to Phase 02                                                                |
| P02   | 02    | Canonical GuideSnapshot v4 and source round-trip                   | verified          | `2158d51` pushed; local 120/120 gate plus GitHub run `31525700447` passed `check` and Playwright desktop/iPad/iPhone; clean-profile source round-trip 2/2                                                                                                                                                                                                                      | proceed to Phase 03                                                                |
| P03   | 03    | Package v2, bounded archive, storage/recovery                      | verified          | `3f70f67` plus TLS test stability fix `64bc867`; local 120/120 forced check; package 38/38, storage 7/7, web 24/24, companion 11/11; GitHub run `31535994450` check + Playwright passed                                                                                                                                                                                        | proceed to Phase 04                                                                |
| P04   | 04    | Real multimodal ingestion providers                                | active            | real CPU Docling/Whisper/ffmpeg smoke paths plus citable table blocks, Poppler PDF page rendering, bounded figure geometry fallback, and hosted OpenRouter VLM transport; scanned/table/figure golden receipts remain UNVERIFIED                                                                                                                                               | run the golden corpus with OpenRouter VLM and capture VLM/figure/OCR evidence      |
| P05   | 05    | Real DeepSeek synthesis with explicit offline fallback             | verified narrowly | OpenRouter-hosted DeepSeek live source probe and API endpoint returned cited schema-valid output with provider/model/cost receipts; strict schema, budgets, cache, multi-source gates, and offline rules are tested                                                                                                                                                            | run the Pack golden multi-source corpus; direct official DeepSeek remains optional |
| P06   | 06    | Training authoring studio                                          | verified narrowly | `dbf992d` source-grounded generator/quality gate, canonical edit/review commands, forced 120/120 check, and 3/3 desktop/iPad/iPhone browser acceptance passed                                                                                                                                                                                                                  | proceed to Phase 07                                                                |
| P07   | 07    | Training runtime, mastery, QTI/xAPI                                | verified narrowly | current `TrainingSession` runtime, Dexie v8 persistence, deterministic fail/remediate/retest/mastery tests, QTI subset/xAPI exports, and 3/3 browser acceptance passed; external conformance unverified                                                                                                                                                                        | proceed to Phase 08                                                                |
| P08   | 08    | Asset providers/importers/converters                               | verified narrowly | `@guideforge/assets` safe GLB/glTF inspection, fail-closed licenses, provider request contracts, metadata schema, `/assets` manager, and 2 browser tests across desktop/iPad/iPhone; external provider/converter/derivative gate unverified                                                                                                                                    | continue with Phase 09 photo-to-3D and retain external gate                        |
| P09   | 09    | Local photo-to-3D production path                                  | verified narrowly | `@guideforge/assets` sanitation/quality/provider/GPU gates, storage-web v9, companion SQLite queue, lifecycle/reuse/Blender-plan tests, and 3/3 browser acceptance; hardware-backed inference and reviewed GLB gate unverified                                                                                                                                                 | run supported GPU/provider golden path                                             |
| P10   | 10    | Durable anchors, arrows, annotations                               | verified narrowly | schema v5 `SurfaceAttachment`/v4 migration, scene-core transform/rebind tests, canonical Yjs/package round trip, correction/review/annotation/measurement/step-state UI, and `scene03` 6/6 browser acceptance                                                                                                                                                                  | proceed to Phase 11; run live multiview/raycast gate                               |
| P11   | 11    | Semantic spatial planner/compiler                                  | verified narrowly | `@guideforge/spatial-compiler` deterministic requirements/graph/consumed constraints/asset resolution/solver/ranked cameras/annotations/step states; typed command application and validation gate; 3 focused tests, 6/6 scene browser acceptance, and forced 125/125 gate                                                                                                     | run live provider/mesh observation gate                                            |
| P12   | 12    | Real procedure player/evidence/resume                              | verified narrowly | review-hardened runtime v2 with v1 migration, Ajv/schema validation, authored per-check evidence mapping, atomic metadata restore, 21 guide-schema tests, 11 storage tests, 5 guide-store tests, 3 browser-profile report-inspecting E2E, 12 Axe checks, and `pnpm exec turbo run check --force --concurrency=1` 125/125                                                       | proceed to Phase 13; physical camera/trusted identity gate remains open            |
| P13   | 13    | Device, performance, accessibility, PWA                            | verified narrowly | route-split shell, real readiness dashboard, local job center, full-backup download/marker, 44px responsive controls, blocking bundle budget, 7/9 Phase 13 browser results, 18/18 Axe results, and serial forced gate 125/125 across desktop/iPad/iPhone emulation                                                                                                             | physical Safari/Pencil/camera/PWA lifecycle and production deploy remain open      |
| P14   | 14    | Release engineering and recovery                                   | verified narrowly | release `0.14.0-rc.1` policy, PWA CSP/cache headers, Tauri matrix, Linux `GuideForge_0.1.0_amd64.deb`, signed personal `.gforge` companion path, 100-file manifest/checksum candidate, and install/upgrade/rollback data-preservation drill; external platform signing/notarization/deployment remain open                                                                     | proceed to Phase 15 security/reliability hardening                                 |
| P15   | 15    | Security and reliability hardening                                 | verified narrowly | Provider SSRF guard, inert HTML/SVG intake, archive/GLTF/injection/auth regression suites, hash-verified storage reads, quota/corruption/job-failure/update tests, forced workspace gate 125/125, policy/boundary/dep/secret checks, clean 78-pass/6-skip Playwright across desktop/iPad/iPhone, and cold-shell p95 1.047s; Strix/live providers/physical recovery unavailable | retain external scanner/provider/device gates                                      |
| P16   | 16    | Golden micropipette/pump/filter certification                      | verified narrowly | Table-driven `phase16-golden.test.ts`: 3/3 projects pass local source/citation, generated training/mastery, typed runtime evidence/attestation, deterministic spatial validation, procedural asset/license path, blocked photo-to-3D CPU seam, full reports/backup, Yjs+store clean-profile import, and semantic snapshot equality                                             | retain real-provider/GPU/device corpus gates                                       |
| P17   | 17    | Production 1.0 release                                             | blocked           | `0a6765d` passes current 125/125 check, 78-pass/6-skip browser emulation, release candidate preparation/verification, 100-file checksum candidate, and recovery drill; current SHA has no GitHub status and real providers/corpus, GPU, physical devices, deployment, and conclusive Strix evidence remain unavailable                                                         | close external blockers; do not cut 1.0                                            |

Phase 00 through Phase 03 are verified from current implementation evidence
and current-SHA GitHub readback. Phase 03's browser evidence is emulated
desktop/iPad/iPhone coverage; physical devices, native keychains, and provider
execution remain explicitly unproven. Phase 04 is active but not verified: the
current host proves real CPU Docling/Whisper/ffmpeg subpaths, and the current
worker adds citable table blocks plus Poppler page/figure fallbacks, but its
scanned OCR run exhausted swap, the hosted VLM fallback and golden corpus have
not been rerun, and no live golden receipt is claimed. Phase 05 is verified narrowly for
the live OpenRouter-hosted DeepSeek semantic path, including a source probe
and API endpoint receipt; the Pack golden multi-source corpus and direct
official DeepSeek endpoint remain unverified. Phase 06 is verified narrowly on
current commit `dbf992d`: the
source-grounded training authoring/review path passed the forced repository
check and all three configured browser projects. Phase 07 is verified narrowly
on the current tree by its runtime/adapter checks and all three configured
browser projects; external QTI conformance, LRS/LMS delivery, cmi5 launch, and
physical-device evidence remain unverified. Phase 08 is verified narrowly for
local asset safety and management only; provider, converter, derivative, and
clean-profile gates remain open. Phase 09 is verified narrowly for local photo
preparation, policy gates, queue persistence, lifecycle/reuse contracts, and
emulated browser cancellation; hardware-backed inference, reviewed GLB output,
Blender execution, and physical camera evidence remain unverified. No later
phase may inherit a `verified` status from the historical ledger. Phase 10 is
verified narrowly for schema v5 surface attachments, v4 migration,
transform/rebind behavior, canonical round trip, correction/review controls,
annotation/measurement/step-state persistence, and 6/6 scene-editor browser
acceptance. Live multiview/vision/raycast, rendered overlays, and physical
device input remain unverified.
Phase 11 is verified narrowly for deterministic spatial compilation and
canonical editor acceptance. External provider asset quality, live vision or
raycast observations, rendered overlays, and physical device behavior remain
unverified.
Phase 12 is verified narrowly for the offline local procedure runtime,
completion-derived progress, content-addressed photo evidence, device-local
attestation artifact, typed measurements/notes, backup/import, completion
report, and emulated desktop/iPad/iPhone browser flow. Physical camera capture,
trusted identity, external signature verification, and long-term device quota
remain unverified. Review hardening additionally scopes evidence to active
attempts, migrates runtime v1 to v2, validates imported runtime and reports
against checked-in schemas and domain rules, enforces authored per-check
mapping, uses atomic metadata restore with staged-asset cleanup, verifies
restored signatures, inspects downloaded report JSON, and adds procedure-player
accessibility scans. The final repository gate passed 125/125 with serial
Turbo scheduling; the unconstrained host run was affected by Vitest worker
contention, while the serial web suite passed 25/25.
Phase 13 is verified narrowly for the route-split web shell, local readiness
dashboard, local photo-job center, full-backup download marker, responsive
touch-sized controls, blocking bundle budgets, and 18/18 Axe scans across the
three configured browser profiles. Physical Safari/Pencil/camera, actual
Split View/Stage Manager, installed-PWA lifecycle, CSP/headers, and production
deployment remain unverified.
Phase 15 closed the local security/reliability gate narrowly. Provider URL
validation, inert HTML/SVG source handling, content-addressed read integrity,
quota pressure, job failure/cancellation, service-worker update control, and
the cold-shell p95 benchmark have current tests and evidence in
`PHASE_15_REPORT.md`. The final forced workspace gate passed 125/125 tasks and
the clean browser run passed 78 tests with 6 explicit skips. Strix was
attempted but inconclusive because its local CLI was unavailable; external
penetration, live provider/GPU, physical-device recovery, and DNS/egress
controls remain unverified.
Phase 16 then certified the shared golden path narrowly for micropipette,
peristaltic-pump, and whole-house-filter project data. All 3/3 table-driven
tests passed, including source citations, offline training mastery, typed
runtime evidence, spatial validation, package reports, and clean-profile
semantic restore. The required real-provider corpus, reviewed photo-to-3D
mesh, GPU, and physical/deployment gates remain unverified.
Phase 17 executed the production cut gate and deliberately did not cut 1.0.
The audited SHA `0a6765d` has fresh local forced-check, browser, release
candidate, checksum, migration/report, and recovery evidence, but remains
local-only with no GitHub status. Real providers/corpus, DeepSeek, GPU mesh,
physical devices, production deployment, and a conclusive Strix scan remain
open; the RC is retained without a version bump or tag.
