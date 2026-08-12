# GuideForge Capability Matrix — Current Production Re-audit

Audited parent SHA: `abefa7475d52931957721b571df828c364c7e924`
Audit date: 2026-08-11
Authority: GuideForge Production Readiness Pack, `ACCEPTANCE_MATRIX.md`

This replaces the prior baseline matrix. A green unit test or an old phase
report is not evidence of a production capability. `verified` below means the
named current-tree check proves that narrow behavior; `partial` means a seam
or incomplete primary path remains; `missing` means the pack requirement is
not implemented; `blocked` means external hardware/provider access is needed.

## Phase 00 baseline

| Requirement                     | Current evidence                                                           | Status                 |
| ------------------------------- | -------------------------------------------------------------------------- | ---------------------- |
| Exact current-tree forced check | `pnpm check --force`: 115/115 after Postgres readiness                     | verified locally       |
| Clean frozen install            | 24 workspaces / 930 packages from zero                                     | verified locally       |
| Browser E2E                     | 43 passed / 2 expected skips with bounded workers                          | verified locally       |
| Postgres integration            | API test file: 17/17 with live `guideforge-pg`                             | verified locally       |
| Package fuzz/drills             | package-gforge: 38/38                                                      | verified locally       |
| Supply-chain gates              | audit, licenses, SBOM, secret scan, policy, boundary, dep-check            | verified locally       |
| Current SHA GitHub status       | PR #1 `check` and Playwright E2E passed for `8b97360`; GitGuardian pending | verified (required CI) |

## Single-owner security and control plane

| Requirement                                                   | Current source signal                                                                                                  | Status            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Real owner credential with Argon2id/current equivalent        | `apps/companion/src/server.test.ts`: owner setup, dummy unknown-owner path, wrong password, Argon2id hash verification | verified locally  |
| Loopback-default companion and secure LAN mode                | `apps/companion`: `127.0.0.1` default; non-loopback requires TLS; real HTTPS listener/client test                      | verified locally  |
| HTTPS required for non-loopback mode                          | `assertTransportConfig` rejects missing key/cert; generated-cert network test receives Secure cookie                   | verified locally  |
| Secure HttpOnly cookie, CSRF/origin, rotation/revoke/recovery | 10 companion tests cover flags, Origin allowlist, rotation, logout, revoke-all, recovery, expiry                       | verified locally  |
| Provider and signing secrets protected from browser storage   | AES-256-GCM `SecretBox`, `0600` storage, metadata-only settings API and settings UX                                    | verified locally  |
| No primary org/RBAC dependency                                | Companion owner/pairing/settings path uses SQLite owner record, not legacy org/workspace/RBAC                          | verified narrowly |
| Rate/resource limits and cancellation                         | Login/request/body/secret limits are tested; durable job cancellation remains a later phase concern                    | partial           |

## Canonical project and package

| Requirement                                           | Current source/test evidence                                                                                                                                          | Status            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Canonical source records materialize/hydrate          | `materializeSnapshot` source map plus Dexie legacy promotion; `roundtrip.test.ts` clears Dexie before import                                                          | verified          |
| Scene/training/assets canonical round-trip            | `roundtrip.test.ts`: 2/2; GitHub Playwright and repository check passed                                                                                               | verified narrowly |
| Claims/citations/generation records                   | v4 schema/domain/Yjs mapping and collaboration hydration coverage; non-live provider generation remains later                                                         | verified narrowly |
| SHA-256 source-region integrity                       | Legacy mapper and ingestion adapter hash regions; round-trip asserts canonical region hashes                                                                          | verified narrowly |
| v1/v2/v3 to canonical v4 migration                    | Pure contiguous migration tests plus legacy Dexie source mapper                                                                                                       | verified locally  |
| Complete `.gforge` package with all referenced assets | v2 draft/backup package round-trip binds scene assets, canonical sources, optional source bytes, reports, and runtime evidence; provider-produced assets remain later | verified narrowly |
| Signed release binding and restore                    | package-gforge drills: 38/38                                                                                                                                          | verified narrowly |

## Phase 03 package, storage, backup, and recovery

| Requirement                                       | Current source/test evidence                                                                                        | Status            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `.gforge` v2 manifest/layout                      | `PackageManifest.schema.json`; deterministic guide/assets/sources/reports/runtime entries and manifest-bound hashes | verified narrowly |
| Source metadata and optional source bytes         | source inventory binding, SHA-256 verification, Dexie `sourceBlobs`, and package tests                              | verified narrowly |
| Generation/validation/cost/license reports        | backup report emission plus asset-license attribution report                                                        | verified narrowly |
| Runtime/evidence inclusion policy                 | evidence index and runtime files are backup-only and rejected when policy is absent                                 | verified narrowly |
| Hostile archive handling                          | central-directory preflight, async fflate extraction, path/size/ratio/total limits, active-content sanitization     | verified narrowly |
| Storage persistence/quota and blob GC             | OPFS with IndexedDB fallback, quota/persistence health, list/remove/garbage collection tests                        | verified narrowly |
| Project export/full backup/restore                | web 4-test suite restores assets, evidence, runtime bytes, reports, and a restore/migration report                  | verified narrowly |
| Companion signing key custody/rotation/revocation | encrypted Ed25519 companion key store, public-key-only web UX, 11 companion tests                                   | verified narrowly |

## Real multimodal ingestion

| Requirement                                           | Current source signal                                                           | Status            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------- |
| Digital PDF, scanned PDF/OCR, tables, figures/bboxes  | Real Docling bridge enables OCR/table structure/bboxes; no live golden run here | partial           |
| DOCX/PPTX/XLSX and image intake                       | Docling standard converter path and explicit browser companion failure          | partial           |
| Real audio ASR and video timestamps                   | ffprobe + Whisper/ffmpeg adapter; no configured live model                      | partial           |
| VLM hard-page fallback                                | OpenAI-compatible VLM adapter is wired only for hard pages; no live endpoint    | partial           |
| Quality report, cancellation, partial/revision impact | Quality/provider receipts and 28 ingestion tests                                | verified narrowly |
| Source Studio upload/regions/receipts/conflicts       | Failed binary state, locator navigation, and 24 web tests                       | partial           |

## AI and synthesis

| Requirement                                               | Current source/test evidence                                                 | Status            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------- |
| Real DeepSeek Source Studio synthesis                     | Server `SynthesisGateway` and endpoint are wired; no live key on this host   | unverified        |
| Explicit offline fallback                                 | `offline-rules` / `synthesis-rules-v1` is separately labeled and tested      | verified narrowly |
| Multi-source citations and SHA-256 integrity              | Request validation, source-hash citations, and SHA-256 excerpt tests         | verified narrowly |
| Deep schema/unit/value gates                              | Runtime output schema, citation, numeric/unit grounding, and repair tests    | verified narrowly |
| Bounded repair, profiles, cache/cost receipt, hard budget | 17 gateway tests cover profiles, cache, receipts, budget refusal, and repair | verified narrowly |
| AI proposes; owner accepts/signs/masters                  | Proposal tests cover pending/accept path                                     | partial           |

## Training

| Requirement                                                | Current source signal                                                                                                            | Status            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Competencies/objectives/lessons/activities/blueprint/items | `dbf992d` generator, v4 schema, deterministic quality gate, canonical commands; training browser path passed desktop/iPad/iPhone | verified narrowly |
| Deterministic mastery/remediation                          | `TrainingSession` scorer proves fail → remediation → retest → mastery with objective and critical-item outcomes                  | verified narrowly |
| Training studio/player/offline attempts                    | `/training/:guideId` plus iPhone-first `/training/player/:guideId`; Dexie v8 resume record and 3/3 browser runtime path          | verified narrowly |
| QTI 3 and xAPI-aligned export                              | QTI 3 package subset/compatibility report and xAPI JSON export tests; external conformance/LRS delivery not claimed              | verified narrowly |

## Execution and evidence

| Requirement                               | Current source/test evidence                    | Status            |
| ----------------------------------------- | ----------------------------------------------- | ----------------- |
| Procedure player renders authored steps   | Vertical-slice E2E passes                       | verified narrowly |
| Real step completion state                | Progress currently equals evidence-row count    | missing           |
| Real photo/signature/measurement evidence | Photo/sign buttons are explicitly demo behavior | missing           |
| 3D step state, resume, offline report     | No complete runtime evidence                    | missing           |

## Assets and 3D

| Requirement                                          | Current source/test evidence                                                                                                                                                                                | Status            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Blank/unknown/GPL license fails closed               | Asset license tests pass                                                                                                                                                                                    | verified narrowly |
| Asset manager/previews/health/providers/STEP-OBJ-STL | `/assets` local-first manager, safe GLB/glTF inspection, provider request contracts, license blocks, and explicit companion-conversion metadata; external download/conversion/derivatives remain unverified | verified narrowly |
| Local photo-to-3D GPU wizard                         | `/photo-to-3d` multi-view wizard, JPEG/PNG/WebP sanitation, quality checks, Dexie v9 jobs, cancellation, and 3/3 browser acceptance; no GPU output                                                          | verified narrowly |
| Hunyuan/license gate/Blender/scale/provenance        | Hunyuan3D-2GP/TripoSR contracts, license/VRAM gates, SQLite queue, reuse key, provenance, and validated Blender argv/LOD plan; provider inference and cleanup execution unverified                          | verified narrowly |

## Spatial intelligence

| Requirement                                | Current source/test evidence                                                                                                                                                                 | Status            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Durable surface anchors                    | Schema v5 `SurfaceAttachment`, v4 migration, mesh-local/barycentric fields, Yjs persistence, transform-stability/rebind tests, and scene editor correction/review controls                   | verified narrowly |
| Arrows/callouts/measurements/step-state UI | Annotation kinds include arrows, labels, callouts, highlights, and paths; measurement and step-state commands/UI plus accessible DOM alternatives; live overlay rendering remains unverified | verified narrowly |
| Semantic AI spatial compiler               | No complete planner/compiler/critic gate                                                                                                                                                     | missing           |
| Deterministic transforms and cameras       | Scene-core/editor tests cover local transforms/cameras                                                                                                                                       | partial           |

## Devices, storage, release, reliability

| Requirement                                   | Current source/test evidence                                                  | Status  |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| Real iPad/iPhone/Pencil/camera/PWA tests      | Browser emulation only; real device unavailable here                          | blocked |
| Persistence/quota/backup/restore              | Local storage/package drills exist; durable backup/restore service incomplete | partial |
| PWA production deploy                         | Local service worker build exists; production deploy not proven               | partial |
| Tauri artifacts/signing/upgrade/rollback      | Desktop package builds; release operations not fully proven                   | partial |
| Golden micropipette/pump/filter certification | No current golden run                                                         | missing |

## Phase certification

Phase 01 is verified on implementation commit `b6ec6b8` by GitHub run
`31498373276` (`check` and Playwright desktop/iPad/iPhone passed), in addition
to the local evidence recorded in its report. Physical iPad/iPhone hardware
and trusted LAN certificate installation remain explicitly unproven. Phase 02
is verified on implementation commit
`2158d5123fca96e088aaf2bf1010ec83523036ba` by GitHub run `31525700447`
(`check` and Playwright desktop/iPad/iPhone passed), with the clean-profile
source round-trip passing locally. Phase 03 is verified on implementation
commit `3f70f67e8c72662bb8a383162d41325df6721a00`, with follow-up TLS test
stability fix `64bc8671073e88f765ff68fa52ee11c805688cc3`; GitHub run
`31533935448` passed on the implementation and `31535994450` passed the fix
(check and Playwright). The Phase 03 gate is verified in clean test storage and emulated
browsers; physical devices, native OS keychains, and live providers remain
unproven. Phase 04–05 remain active and unverified; historical reports do not
change their status. Phase 04's focused contracts and adapters are current-tree
verified, but its Pack golden-provider gate remains **UNVERIFIED** because this
host has no configured Docling, Whisper, or VLM runtime. Phase 06 is verified
narrowly on current commit `dbf992d`: the authoring graph, citation quality
gate, canonical edit commands, and browser review path pass. Phase 07 is
verified narrowly on the current tree for local deterministic runtime, Dexie
persistence, QTI subset, xAPI JSON, and emulated browser flow; external QTI
conformance, LRS/LMS delivery, cmi5 launch, and physical devices remain
unverified. Phase 08 is verified narrowly for local asset safety, provider
request contracts, metadata, and emulated browser management; external
provider, converter, derivative, and clean-profile gates remain unverified.
Phase 09 is verified narrowly for local photo sanitation, quality/provider/GPU
policy, Dexie and SQLite queue persistence, lifecycle transitions, reuse
planning, and emulated browser cancellation. Hardware-backed Hunyuan3D/TripoSR
inference, Blender execution, reviewed reusable GLB output, and physical camera
behavior remain unverified. No later phase may inherit a `verified` status from
a historical ledger. Phase 10 is verified narrowly for schema v5 surface
attachments, v4 migration, transform stability, correction/review controls,
annotation/measurement/step-state persistence, package round trip, and 6/6
scene-editor browser acceptance. Live multiview vision, mesh raycast,
rendered overlays, and physical-device input remain unverified.
