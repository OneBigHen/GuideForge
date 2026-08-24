# Phase 15 Report — Security, Reliability, and Performance Hardening

## Gate status

**VERIFIED NARROWLY.** Current-tree attack and recovery checks pass with no
known unresolved critical/high finding in the exercised code. The gate is not
a claim of external penetration-test coverage, physical-device recovery, or
live provider/GPU behavior.

## Delivered hardening

- Provider adapters validate server-side base URLs before `fetch`: HTTPS and
  explicit host allowlists are required for remote providers; loopback is an
  explicit local-provider seam; credentials, query/fragment data, private
  address literals, metadata hosts, and non-HTTPS remote endpoints fail closed.
- VLM deployment accepts remote endpoints only through `VLM_ALLOWED_HOSTS` or
  an explicit constructor allowlist. Local Ollama-style loopback endpoints
  remain available for development.
- Package metadata rejects active SVG/script/event-handler content, while
  archive path, size, compression-ratio, hash, and unlisted-entry checks stay
  in force.
- Content-addressed source and asset reads now re-hash bytes. Corrupted OPFS,
  IndexedDB, or source-blob data returns `null` instead of being treated as a
  valid artifact.
- Storage pressure, persistence request, photo-job pause/resume/cancel, and
  provider-failure/GPU-OOM state have runnable tests.
- Service-worker updates remain user-controlled: a waiting worker is activated
  only by the explicit reload action. The production Workbox path continues to
  precache the shell without silently taking over an active session.
- A five-sample desktop cold-shell benchmark records p95 and enforces the
  5-second budget. The final clean run measured `519,689,698,883,1047ms`,
  p95 `1047ms`; the production offline shell E2E passed.
- Stale home-route E2E assertions were aligned with the current accessible
  heading (`Project readiness`) so the suite tests the real user-facing path.

## Security/reliability evidence

| Area                                                                 | Current evidence                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Owner auth, CSRF/origin, cookies, sessions, recovery, secret custody | Companion 12/12 tests; prior controls re-read on current tree                                                                       |
| Archive, active metadata, signing/tamper, fuzzing, rollback          | package-gforge 38/38                                                                                                                |
| GLB/glTF safety and license fail-closed policy                       | assets 19/19                                                                                                                        |
| Prompt-injection and schema/citation gates                           | ai-contracts 17/17; model-gateway 17/17                                                                                             |
| Provider SSRF regression guard                                       | model-gateway and worker-documents tests pass; remote allowlist and loopback seams covered                                          |
| Document/media converter safety                                      | worker-documents 20/20; Docling/ffprobe/Whisper/Blender boundaries use argv-separated `execFile` calls with bounded output/timeouts |
| Storage corruption/quota/recovery                                    | storage-web 14/14; full-backup/import and release recovery drills remain passing                                                    |
| Job interruption/GPU failure                                         | assets 19/19; failure is persisted and cancellation is explicit                                                                     |
| Offline/update path                                                  | service-worker unit path passes; offline Chromium E2E passes                                                                        |
| Cold shell performance                                               | desktop Playwright benchmark p95 1.047s < 5s                                                                                        |
| Supply-chain policy                                                  | audit and policy tests pass; secret scan remains fallback mode because gitleaks is unavailable                                      |

## Final repository gate

- `pnpm check --force`: **125/125 tasks passed** in 6m45s.
- `pnpm security:policy-test`, `security:audit`, `security:licenses`,
  `boundary`, `dep-check`, and `scripts/secret-scan.sh`: **all passed**.
- `CI=1 pnpm --filter @guideforge/web exec playwright test`: **78 passed,
  6 skipped**, one worker, across desktop Chromium, iPad, and iPhone profiles.
- The six skips are existing unsupported profile paths; no test failure was
  suppressed.

## Scanner and external boundaries

The required local Strix review was attempted with the configured local Ollama
endpoint, but the Strix CLI is not installed or cached and the skill refuses
to download it. This is **inconclusive**, not a security pass. No external
provider key, live Docling/Whisper/VLM service, GPU inference runtime, physical
camera, installed PWA, or LAN penetration environment is available on this
host. Those remain explicit Phase 04/05/09/13/16 or deployment gates.

The provider host guard is intentionally a configuration boundary, not a DNS
firewall. Production deployments must still restrict egress and prevent DNS
rebinding at the network layer.

## Gate interpretation

No tested critical/high issue is open in the current source. Phase 15 is
therefore closed narrowly for the local RC, with the external and scanner
limitations above recorded rather than converted into PASS claims.
