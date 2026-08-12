# Phase 16 Report — Golden End-to-End Certification

## Gate status

**VERIFIED NARROWLY.** The same table-driven certification path passes all
three required project shapes without fixture-specific branching. It proves
the current local-first product contract from source intake through clean
profile restore. It does not claim the unavailable external provider or
physical/GPU gates.

## Certified projects

| Project                                  | Source path                                                             | Training/runtime                                                                             | Spatial/assets                                                                                        | Package/restore                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Micropipette calibration                 | Markdown text ingestion, canonical regions, source hash/citation checks | Generated source-grounded assessment, offline mastery, note/measurement/attestation evidence | Procedural pipette, balance, beaker, workbench; anchors, annotations, cameras; validator passes       | Full backup, cost/license/validation/generation reports, runtime evidence, clean import, semantic snapshot equality |
| Peristaltic pump tubing replacement      | Same generic ingestion/citation path                                    | Same offline training and typed runtime evidence path                                        | Procedural pump, tubing, workbench; photo-to-3D CPU seam is correctly blocked and provenance retained | Same package and clean-profile restore checks                                                                       |
| Whole-house filter cartridge replacement | Same generic ingestion/citation path                                    | Same offline training and typed runtime evidence path                                        | Procedural housing, cartridge, valve, workbench; anchors, annotations, cameras; validator passes      | Same package and clean-profile restore checks                                                                       |

## Evidence

Command:

```text
pnpm --filter @guideforge/web exec vitest run src/services/phase16-golden.test.ts
```

Result: **1 test file, 3 tests passed**. The test exercises:

- local text ingestion, immutable source bytes, canonical source migration,
  region content hashes, and conservative source citations;
- deterministic training generation, source-grounded assessment items, offline
  answer submission, and mastery;
- typed runtime notes and measurements, ECDSA local attestation, completion
  reports, and persisted evidence;
- procedural asset creation, license metadata, content-addressed bytes, the
  semantic spatial compiler, non-overlap/workspace validation, surface
  attachments, annotations, cameras, and step states;
- the provider-free photo-to-3D policy seam for the pump project, which fails
  closed on CPU while preserving source hashes and provenance;
- full `.gforge` backup entries for sources, assets, runtime evidence, and
  cost/license/validation/generation reports;
- clearing the Yjs profile and browser stores, importing the backup, and
  comparing the restored canonical snapshot semantically.

## External limits

The source fixtures are deterministic Markdown seams because this host has no
configured Docling/OCR/ASR/VLM runtime or DeepSeek key. No real PDF/scanned
PDF/table/figure/audio/video provider corpus, reviewed photo-generated mesh,
GPU inference, physical device, or production deployment is certified here.
The pump photo-to-3D check is intentionally a blocked CPU capability result,
not a fabricated completion. Phase 04/05/09/13 external gates remain open.

## Decision

Phase 16 is closed narrowly for the local implementation and is not a 1.0
release approval. Phase 17 must carry the unresolved external gates into its
release decision and must not cut 1.0 while they remain in the supported
matrix.
