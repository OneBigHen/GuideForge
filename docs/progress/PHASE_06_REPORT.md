# Phase 06 Report — Production Training Domain and Studio

## Gate status

The Phase 06 gate is **VERIFIED NARROWLY** on the current implementation
commit `dbf992dd915ce6e8e36065a16651da2be0591312`.

A procedure with an uploaded text source can generate a complete training
draft, persist it through the canonical command/Yjs path, edit objectives and
assessment text, and mark source-grounded items reviewed in the training
studio. The quality report fails closed when answer keys, feedback, or
source-region citations are missing or invalid.

This is current-tree evidence only. Phase 07 still owns runtime scoring,
attempt persistence, offline mastery/resume, and QTI/xAPI export; those are not
claimed here.

## Delivered path

- `@guideforge/guide-schema` now contains backward-compatible v4 training
  structures for competencies, objectives, modules, lessons, activities,
  assessment blueprints, item feedback, remediation edges, and mastery policy.
- `generateTrainingFromProcedure` deterministically creates one competency,
  objective, instruction/practice path, assessment item, remediation edge, and
  source-cited blueprint per procedure task/step.
- `validateTrainingProgram` checks graph references, measurable objective
  fields, deterministic answer keys, correct/incorrect feedback, exact
  `sourceHash:regionId` citations, policy bounds, and coverage counts before a
  program is considered reviewable.
- Training mutations use canonical typed commands for replacement, objective
  edits, item edits, and review-state changes. Legacy v4 training remains
  readable because the new collections are optional and empty defaults are
  materialized for new documents.
- `/training/:guideId` is a real TanStack route with quality/coverage
  reporting, competency/module/lesson/activity views, editable objectives and
  items, answer-key/rationale/feedback visibility, remediation links, and
  review controls.
- The editor links to the studio, and the studio links back to Source Studio
  and the procedure player. The generated route tree is checked in.

## Evidence

| Check                                  | Result                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@guideforge/guide-schema` tests       | 10 passed, including generated graph and citation-tamper gate                                                                  |
| `@guideforge/commands` tests           | 8 passed, including canonical replacement/edit/review and no-aliasing                                                          |
| `@guideforge/collaboration` tests      | 5 passed                                                                                                                       |
| `@guideforge/web` unit tests           | 24 passed                                                                                                                      |
| `@guideforge/web` typecheck/lint/build | Passed; existing warnings only                                                                                                 |
| Training browser acceptance            | 3/3: desktop Chromium, iPad, iPhone                                                                                            |
| Browser path covered                   | Create guide → add procedure step → upload text source → open training studio → generate → edit objective/item → mark reviewed |
| Forced repository check                | `pnpm exec turbo run check --force --concurrency=2`: 120/120, 0 cached, 6m09.842s                                              |
| Schema file parse                      | `GuideSnapshot.schema.json` parses as JSON                                                                                     |
| Secret/whitespace checks               | `git diff --cached --check` and repository secret scan passed; gitleaks unavailable, regex fallback used                       |

## Grounding boundary

The generator does not invent a citation. It first follows the canonical
step-claim-citation graph; for imported procedures without that graph it only
uses an exact normalized match between the step instruction and a canonical
source-region text. No match produces a visible quality error, not a guessed
answer key.

The current browser acceptance uses a text source so the local-first path can
prove real regions without requiring a companion provider. Docling/OCR/VLM,
audio/video providers, and live DeepSeek remain governed by their earlier
explicit provider gates.

## Next phase

Phase 07 must add the actual learner runtime: deterministic scoring, attempt and
mastery state, remediation execution, offline resume/reporting, and QTI/xAPI
export. The authoring graph and studio are ready for that runtime; no Phase 07
PASS is inherited.

**Gate:** VERIFIED NARROWLY — current browser and forced-check evidence passed;
runtime/export certification remains Phase 07.
