# Phase 07 Report — Training Runtime, Mastery, QTI/xAPI

## Gate status

The Phase 07 gate is **VERIFIED NARROWLY** on the current tree. The local
runtime proves fail → remediation → retest → mastery offline, persists a
resumable session in Dexie v8, and exports xAPI-aligned statements plus a
bounded QTI 3.0 package subset with compatibility reporting.

This is not an external conformance claim. No LRS, LMS, cmi5 launch, or QTI
certification service was contacted.

## Delivered path

- `@guideforge/guide-schema` contains the framework-free `TrainingSession`,
  `TrainingAttempt`, item/objective outcomes, event model, deterministic
  scorer, remediation/retest transitions, xAPI JSON adapter, QTI 3.0
  import/export adapter, and cmi5 launch seam.
- Scoring supports the authored single-choice path and explicit
  multiple-response, ordering, numeric, and short-answer rules. Missing or
  malformed responses score incorrect; no provider can change the answer key.
- `@guideforge/storage-web` adds Dexie v8 `trainingSessions` records and the
  checked-in `TrainingSessionRecord.schema.json` contract.
- `apps/web` adds local session/answer/submit/retest service calls and an
  iPhone-first Training Player with progress, attempt history, remediation
  activity ids, and xAPI/QTI downloads.
- QTI export emits the required package manifest plus assessment/test/item XML
  for supported single-choice items. Unsupported items are listed rather than
  silently dropped.

## Evidence

| Check                              | Result                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| Guide-schema runtime/interop tests | 14 passed across 2 files                                                            |
| Storage-web tests                  | 8 passed, including Dexie v8 training-session persistence                           |
| Web typecheck/lint/build           | Passed; existing canvas/bundle warnings only                                        |
| Training browser acceptance        | 3/3: desktop Chromium, iPad, iPhone                                                 |
| Browser path covered               | Generate source-grounded program → fail assessment → remediation → retest → mastery |
| Standards boundary                 | xAPI JSON and QTI package subset generated locally; cmi5 explicitly seam-only       |

## Known boundary

The player and exports are local-first and provider-independent. The QTI
adapter intentionally supports only the simple-choice subset and reports the
ceiling. Imported QTI has no source grounding until an owner reviews it. The
current host has no configured LRS/LMS, so network delivery and external
conformance remain unverified.

**Gate:** VERIFIED NARROWLY — current runtime, storage, adapter, and emulated
browser evidence passed; external standards and physical-device evidence are
not claimed.
