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
| Package fuzz/drills             | package-gforge: 35/35                                                      | verified locally       |
| Supply-chain gates              | audit, licenses, SBOM, secret scan, policy, boundary, dep-check            | verified locally       |
| Current SHA GitHub status       | PR #1 `check` and Playwright E2E passed for `8b97360`; GitGuardian pending | verified (required CI) |

## Single-owner security and control plane

| Requirement                                                   | Current source signal                                                    | Status  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| Real owner credential with Argon2id/current equivalent        | No companion owner-auth path                                             | missing |
| Loopback-default companion and secure LAN mode                | `apps/companion` is absent                                               | missing |
| HTTPS required for non-loopback mode                          | No network owner runtime                                                 | missing |
| Secure HttpOnly cookie, CSRF/origin, rotation/revoke/recovery | Enterprise-era API path; no complete single-owner session                | missing |
| Provider and signing secrets protected from browser storage   | Provider path is server-side, but signing/browser legacy findings remain | partial |
| No primary org/RBAC dependency                                | Current API still contains organization/workspace heritage               | partial |
| Rate/resource limits and cancellation                         | Some converter timeout/size checks; no complete owner job policy         | partial |

## Canonical project and package

| Requirement                                           | Current source/test evidence                                                         | Status            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| Canonical source records materialize/hydrate          | `materializeSnapshot` returns `sources: []`; Dexie owns Source Studio records        | missing           |
| Scene/training/assets canonical round-trip            | `roundtrip.test.ts`: 2/2                                                             | partial           |
| Multi-source citations round-trip                     | Citations are tested in proposals/roundtrip fixtures, not complete source hydration  | partial           |
| SHA-256 source-region integrity                       | Storage/package paths use hashes; end-to-end source region binding is incomplete     | partial           |
| v1/v2/v3 to canonical v4 migration                    | No current complete migration gate                                                   | missing           |
| Complete `.gforge` package with all referenced assets | Current round-trip covers a local fixture; source/package completeness is not proven | partial           |
| Signed release binding and restore                    | package-gforge drills: 35/35                                                         | verified narrowly |

## Real multimodal ingestion

| Requirement                                           | Current source signal                                                          | Status  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| Digital PDF, scanned PDF/OCR, tables, figures/bboxes  | Deterministic ingestion contracts exist; real provider execution not proven    | partial |
| DOCX/PPTX/XLSX and image intake                       | MIME/domain seams exist; complete production converters not proven             | partial |
| Real audio ASR and video timestamps                   | No live provider evidence                                                      | missing |
| VLM hard-page fallback                                | No live provider evidence                                                      | missing |
| Quality report, cancellation, partial/revision impact | Cancellation/partial domain tests exist; complete reports/revisions incomplete | partial |
| Source Studio upload/regions/receipts/conflicts       | `sourceStudio.test.ts`: 9/9 UI/service tests                                   | partial |

## AI and synthesis

| Requirement                                               | Current source/test evidence                                                  | Status            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| Real DeepSeek Source Studio synthesis                     | Current tests exercise `synthesis-rules-v1` offline rules                     | missing           |
| Explicit offline fallback                                 | Rules path is named and tested                                                | verified narrowly |
| Multi-source citations and SHA-256 integrity              | Proposal tests retain citations/receipts; full source package binding absent  | partial           |
| Deep schema/unit/value gates                              | Current proposal tests reject ungrounded values; complete schema gate remains | partial           |
| Bounded repair, profiles, cache/cost receipt, hard budget | Receipt path exists; production budget enforcement not proven                 | partial           |
| AI proposes; owner accepts/signs/masters                  | Proposal tests cover pending/accept path                                      | partial           |

## Training

| Requirement                                                | Current source signal                       | Status  |
| ---------------------------------------------------------- | ------------------------------------------- | ------- |
| Competencies/objectives/lessons/activities/blueprint/items | Basic objective/assessment structures exist | partial |
| Deterministic mastery/remediation                          | No complete runtime gate                    | missing |
| Training studio/player/offline attempts                    | No complete studio/player evidence          | missing |
| QTI 3 and xAPI-aligned export                              | No current production export gate           | missing |

## Execution and evidence

| Requirement                               | Current source/test evidence                    | Status            |
| ----------------------------------------- | ----------------------------------------------- | ----------------- |
| Procedure player renders authored steps   | Vertical-slice E2E passes                       | verified narrowly |
| Real step completion state                | Progress currently equals evidence-row count    | missing           |
| Real photo/signature/measurement evidence | Photo/sign buttons are explicitly demo behavior | missing           |
| 3D step state, resume, offline report     | No complete runtime evidence                    | missing           |

## Assets and 3D

| Requirement                                          | Current source/test evidence                                         | Status            |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| Blank/unknown/GPL license fails closed               | Asset license tests pass                                             | verified narrowly |
| Asset manager/previews/health/providers/STEP-OBJ-STL | Local procedural/GLB path exists; provider/converter path incomplete | partial           |
| Local photo-to-3D GPU wizard                         | No production local GPU path                                         | missing           |
| Hunyuan/license gate/Blender/scale/provenance        | No complete live evidence                                            | missing           |

## Spatial intelligence

| Requirement                                | Current source/test evidence                                   | Status  |
| ------------------------------------------ | -------------------------------------------------------------- | ------- |
| Durable surface anchors                    | No canonical anchor persistence path                           | missing |
| Arrows/callouts/measurements/step-state UI | Basic scene annotations exist; durable semantic runtime absent | partial |
| Semantic AI spatial compiler               | No complete planner/compiler/critic gate                       | missing |
| Deterministic transforms and cameras       | Scene-core/editor tests cover local transforms/cameras         | partial |

## Devices, storage, release, reliability

| Requirement                                   | Current source/test evidence                                                  | Status  |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| Real iPad/iPhone/Pencil/camera/PWA tests      | Browser emulation only; real device unavailable here                          | blocked |
| Persistence/quota/backup/restore              | Local storage/package drills exist; durable backup/restore service incomplete | partial |
| PWA production deploy                         | Local service worker build exists; production deploy not proven               | partial |
| Tauri artifacts/signing/upgrade/rollback      | Desktop package builds; release operations not fully proven                   | partial |
| Golden micropipette/pump/filter certification | No current golden run                                                         | missing |

## Phase certification

No Phase 01–17 is certified by this matrix. The prior reports remain useful as
implementation history only and are marked as such in their files. Each phase
must replace its rows with current implementation, provider, package, device,
and release evidence before its ledger status changes to `verified`.
