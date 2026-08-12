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
- Dexie v11 persists runtime sessions; checked-in Draft 2020-12 JSON Schemas
  plus Ajv validation cover runtime sessions, completion reports, and evidence.
  The v10 runtime format migrates to runtime version 2 before use.
- The player uses the native `capture="environment"` photo input, the existing
  content-addressed store, and the existing metadata sanitizer before storing
  a photo evidence hash.
- The player creates and verifies an ECDSA P-256 local attestation, stores its
  canonical JSON artifact, records typed measurements and notes, and displays
  the current step's scene items, camera, and annotations.
- Full backup/export/import preserves evidence, runtime session JSON, runtime
  artifacts, and completion reports; draft export remains runtime-free.

## Evidence

| Check                       | Result                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime state-machine tests | `pnpm --filter @guideforge/guide-schema test`: 21 passed across 3 files; active-attempt, authored-check mapping, v1 migration, and deep-state rejection covered |
| Guide store runtime test    | `pnpm --filter @guideforge/web exec vitest run src/services/guideStore.test.ts`: 5 passed; persistence, typed evidence, signature round-trip, backup/import, tamper rejection                                             |
| Storage/schema tests        | `pnpm --filter @guideforge/storage-web test`: 11 passed; Dexie v11 persistence/conformance, Ajv validation, and checked-in schema rejection cases |
| Browser runtime acceptance  | `pnpm --filter @guideforge/web exec playwright test e2e/run12.spec.ts`: 3 passed in 1.1m; multi-step photo/attestation/note completion, offline UI, and downloaded report JSON inspection across desktop/iPad/iPhone |
| Accessibility acceptance    | `pnpm --filter @guideforge/web exec playwright test e2e/a11y.spec.ts`: 12 passed in 1.0m; critical/serious Axe violations absent, including procedure player                                                              |
| Existing vertical slice     | Existing native photo/file capture path retained; `pnpm --filter @guideforge/web exec playwright test e2e/vertical-slice.spec.ts --workers=1`: 3 passed in 2.1m across desktop/iPad/iPhone |
| Security policy             | `bash scripts/secret-scan.sh`: fallback scan passed; tampered attestation backup rejected by guide-store test; gitleaks unavailable on host                                                                               |
| Performance                 | Web build passes, but the existing 1.795 MB minified main chunk remains above the 500 kB warning threshold; performance budget is open for Phase 13                                                                       |
| Forced repository gate      | `pnpm exec turbo run check --force --concurrency=1`: 125/125 tasks passed in 13m6.444s; the unconstrained host run hit Vitest worker contention, then the serial web suite passed 25/25 |

## Known boundary

The browser gate uses emulated device profiles and a synthetic image selected
through the same native file/camera input; it does not prove a physical iPhone
camera, a trusted user identity, external signature verification, or provider
sync. Desktop Chromium proves offline reload/resume; Playwright WebKit cannot
navigate to a newly reloaded page while its network is disabled, so the iPad and
iPhone projects prove offline UI/completion plus online reload/report export.
WebCrypto attestation is intentionally device-local and the completion report
is local JSON. Those boundaries remain explicit for later device, security, and
release phases. The runtime state is validated against the checked-in contract
with Ajv and domain guards before backup restore; imported completion evidence
must exist, belong to its canonical step, satisfy the authored verification
mapping, and meet the minimum count. Restore stages assets and commits metadata
in one Dexie transaction, cleaning staged data on failure. The report is scoped
to the selected runtime session and downloaded JSON is inspected by browser
acceptance.

**Gate:** VERIFIED NARROWLY — offline local execution, real evidence hashing,
attestation artifact, typed measurements, completion state, backup/import, and
emulated browser acceptance pass; physical-device and trusted-identity proof
remain unverified.
