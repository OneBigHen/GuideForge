# ADR 0019: Phase 07 Offline Training Runtime and Standards Adapters

## Status

Accepted for the Phase 07 implementation.

## Decision

Keep authored training in canonical `GuideSnapshot.training`. Persist learner
progress separately as a JSON-safe `TrainingSession` in Dexie v8. The runtime
owns answers, attempts, deterministic objective outcomes, remediation activity
ids, retest state, and mastery status; it never mutates the authored graph.

QTI 3.0 and xAPI are adapters at the boundary. The QTI adapter emits an
`imsmanifest.xml`, an assessment test, and compatible single-choice item files,
and reports unsupported interaction types. It imports the same conservative
subset with a warning that imported content has no source citations until the
owner maps it to canonical regions. The xAPI adapter emits local JSON
statements from the same attempt log and never sends learner data to an LRS.

cmi5 is an explicit launch-metadata seam only. GuideForge does not claim LMS,
LRS, or external standards conformance from a local export test.

## Consequences

- A learner can answer, close the app, resume the same local session, fail,
  follow remediation, retest, and reach mastery without a network provider.
- Scoring is deterministic: exact response matching, threshold, required
  objectives, and critical-item policy are all recorded in the attempt.
- Standards exports can be independently validated without coupling the
  canonical domain to QTI XML or xAPI transport details.
- External QTI conformance certification, LRS delivery, and cmi5 launch are
  still separate production gates.
