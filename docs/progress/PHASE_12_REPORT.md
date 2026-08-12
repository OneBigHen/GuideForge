# Phase 12 Report — Real Procedure Player and Evidence

## Gate status

The Phase 12 gate is **VERIFIED NARROWLY** on the current tree. A multi-step
guide can be completed sequentially with real local photo evidence, a verified
device-local attestation artifact, typed measurements/notes, completion-derived
progress, offline reload/resume, and a JSON completion report export.

## Delivered path

- `packages/guide-schema/src/execution-runtime.ts` defines versioned
  `RuntimeSession`, `StepAttempt`, `StepCompletion`, explicit evidence rules,
  progress, and completion-report projections.
- Dexie v10 persists runtime sessions; checked-in JSON Schemas cover runtime
  sessions and the expanded evidence record.
- The player uses the native `capture="environment"` photo input, the existing
  content-addressed store, and the existing metadata sanitizer before storing
  a photo evidence hash.
- The player creates and verifies an ECDSA P-256 local attestation, stores its
  canonical JSON artifact, records typed measurements and notes, and displays
  the current step's scene items, camera, and annotations.
- Full backup/export/import preserves evidence, runtime session JSON, runtime
  artifacts, and completion reports; draft export remains runtime-free.

## Evidence

| Check                       | Result                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Runtime state-machine tests | 2 passed: evidence-gated completion/progress and report projection                                                               |
| Guide store runtime test    | 5 passed: persistence, typed evidence, ECDSA attestation, report, backup/import                                                  |
| Storage/schema tests        | 9 passed; Dexie v10 runtime session table and schemas parse                                                                      |
| Browser runtime acceptance  | `run12.spec.ts`: multi-step photo/attestation/note completion, offline reload, report export across desktop/iPad/iPhone projects |
| Existing vertical slice     | Real native photo/file capture path remains passing                                                                              |
| Forced repository gate      | `pnpm check --force`: 125/125 tasks passed in 7m50.445s                                                                          |

## Known boundary

The browser gate uses emulated device profiles and a synthetic image selected
through the same native file/camera input; it does not prove a physical iPhone
camera, a trusted user identity, external signature verification, or provider
sync. Desktop Chromium proves offline reload/resume; Playwright WebKit cannot
navigate to a newly reloaded page while its network is disabled, so the iPad and
iPhone projects prove offline UI/completion plus online reload/report export.
WebCrypto attestation is intentionally device-local and the completion report
is local JSON. Those boundaries remain explicit for later device, security, and
release phases.

**Gate:** VERIFIED NARROWLY — offline local execution, real evidence hashing,
attestation artifact, typed measurements, completion state, backup/import, and
emulated browser acceptance pass; physical-device and trusted-identity proof
remain unverified.
