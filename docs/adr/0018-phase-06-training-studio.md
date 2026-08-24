# ADR 0018 — Source-Grounded Training Studio

**Status:** Accepted with runtime gate deferred to Phase 07
**Date:** 2026-08-11
**Phase:** 06

## Decision

Keep the training program inside the canonical v4 `GuideSnapshot` and expose
authoring changes through the typed command bus. Add optional v4 collections so
older snapshots remain readable while newly generated programs carry the full
authoring graph:

- competencies → objectives → procedure steps;
- modules → lessons → instruction/practice activities;
- assessment blueprint → item bank with deterministic answer keys,
  rationales, and explicit correct/incorrect feedback;
- failed-item remediation edges and a versioned mastery policy.

The generator is deterministic and source-first. It follows existing claim
citations, then permits only an exact normalized step/source-region text match
for imported procedures without a retained claim graph. Every authored
objective, answer key, rationale, feedback record, activity, blueprint, and
remediation edge must carry a valid canonical `sourceHash:regionId` citation.

The training route is a review studio, not an auto-apply AI surface. Generation
replaces the canonical draft through a command, while objective/item edits and
review-state changes are separate commands and remain visible to the owner.

## Consequences

- Human review can see the source relation, answer key, rationale, feedback,
  and remediation path before a learner runtime consumes the program.
- Missing or stale source grounding is visible as a quality error instead of
  becoming an apparently complete training item.
- Existing v4 documents do not need a migration for the optional collections;
  `createEmptyTraining` supplies the new defaults for new and normalized docs.
- Runtime attempt state, scoring, offline resume, and QTI/xAPI remain separate
  concerns for Phase 07 rather than being implied by the authoring model.
