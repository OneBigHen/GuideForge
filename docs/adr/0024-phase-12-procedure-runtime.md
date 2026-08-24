# ADR 0024: Offline Procedure Runtime and Evidence

## Status

Accepted for Phase 12.

## Decision

Keep authored procedure content in the canonical Yjs guide, and persist learner
execution separately as a versioned Dexie `RuntimeSession`. The runtime owns
ordered `StepAttempt` and `StepCompletion` records, explicit evidence-backed
completion rules, current-step progress, and resumable status.

Evidence is content-addressed in the existing OPFS/IndexedDB asset store. Photo
capture uses the native camera/file input and strips supported JPEG/PNG/WebP
metadata before hashing. Measurements are typed values with a label and unit.
Attestation evidence is a locally generated ECDSA P-256 signature over a
canonical payload; the JSON artifact, public key, signature, and payload hash
are stored together. This proves device-local artifact integrity, not a
centrally verified human identity.

Full `.gforge` backups include the evidence index, runtime session JSON, runtime
artifacts, and completion reports. Draft exports intentionally omit runtime
evidence. The player uses the service-worker shell plus local storage so a
reload can resume without a network connection.

The persisted implementation is pinned by the repository lockfile to Dexie
4.4.4, y-indexeddb 9.0.12, and Ajv 8.20.0. Dexie v11 migrations convert the
v1 runtime session shape to runtime version 2. Ajv Draft 2020-12 validation
and domain guards cover evidence, runtime sessions, and completion reports;
runtime imports additionally enforce canonical step IDs, evidence existence
and provenance, authored verification mappings, and minimum counts. Restore
stages content-addressed assets and commits metadata in one Dexie transaction,
with cleanup on failure. The v11 table has a storage conformance test.
Browser API behavior follows the official [Dexie transaction
documentation](https://dexie.org/docs/Dexie/Dexie.transaction), [MDN
SubtleCrypto documentation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto),
and [MDN input capture documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture).

## Consequences

- Progress cannot advance merely because an evidence row exists; the explicit
  completion transition is authoritative.
- A completion report can enumerate each step, completion, evidence kind, and
  content hash without inventing procedure claims.
- Physical camera behavior, iPhone hardware capture, trusted identity, and
  long-term quota/backup recovery remain separate acceptance gates.
