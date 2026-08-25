# Acceptance Matrix

Use `PASS`, `FAIL`, or `BLOCKED` with evidence links/log paths. No “mostly.”

| ID  | Critical | Requirement                                                         | Evidence |
| --- | -------: | ------------------------------------------------------------------- | -------- |
| A1  |      YES | Public URL uses browser-trusted HTTPS                               |          |
| A2  |      YES | `window.isSecureContext === true` on public app                     |          |
| A3  |      YES | Asset catalog seeds without Web Crypto error                        |          |
| A4  |      YES | LAN HTTP failure is actionable, not opaque crash                    |          |
| A5  |      YES | Seed catalog is idempotent                                          |          |
| D1  |      YES | Fresh browser sees/launches demo with zero prior state              |          |
| D2  |      YES | Demo is normal GuideForge schema/runtime, not static mock page      |          |
| D3  |      YES | Demo includes procedural asset reference(s)                         |          |
| D4  |      YES | Demo run can complete                                               |          |
| D5  |      YES | Demo training can complete                                          |          |
| D6  |      YES | Demo fixture contains no unapproved real-person private data        |          |
| AI1 |      YES | Real owner AI call reaches OpenRouter path                          |          |
| AI2 |      YES | Real AI receipt/provider visible                                    |          |
| AI3 |      YES | Real mode does not silently use FakeModelAdapter on failure         |          |
| AI4 |      YES | Source synthesis real-provider path works                           |          |
| AI5 |      YES | Provider key absent from browser bundle/network response            |          |
| P1  |      YES | Anonymous demo AI requires server-verified Turnstile                |          |
| P2  |      YES | Turnstile replay/invalid token rejected before provider call        |          |
| P3  |      YES | Anonymous AI cannot select arbitrary provider/model                 |          |
| P4  |      YES | Anonymous AI cannot mutate canonical owner data                     |          |
| P5  |      YES | Anonymous AI input/output/cost limits enforced                      |          |
| P6  |      YES | Public AI quota remains effective across app restart/edge authority |          |
| P7  |      YES | `AI_PUBLIC_DEMO_ENABLED=false` prevents provider invocation         |          |
| S1  |      YES | Owner UUID alone is not sufficient authentication                   |          |
| S2  |      YES | Owner authoring paths protected by real auth/Access                 |          |
| S3  |      YES | Production owner cookie is Secure + HttpOnly                        |          |
| S4  |      YES | Cookie-authenticated writes enforce production Origin               |          |
| S5  |      YES | Companion secret/signing endpoints are not anonymous                |          |
| S6  |      YES | No direct public DB/API/collab/companion ports                      |          |
| S7  |      YES | Production secrets are not committed                                |          |
| C1  |      YES | Cloudflare WAF/rate limit covers AI/login high-cost paths           |          |
| C2  |      YES | AI Gateway global spend limit configured                            |          |
| C3  |      YES | Provider/OpenRouter account cap configured                          |          |
| C4  |      YES | AI Gateway prompt/response payload logging disabled by default      |          |
| O1  |      YES | AI cost/token/status metadata observable                            |          |
| O2  |      YES | 401/403/429/provider failures observable                            |          |
| O3  |       NO | Alerts configured for spend/error thresholds                        |          |
| R1  |      YES | `pnpm format:check` passes                                          |          |
| R2  |      YES | `pnpm lint` passes                                                  |          |
| R3  |      YES | `pnpm typecheck` passes                                             |          |
| R4  |      YES | `pnpm test` passes                                                  |          |
| R5  |      YES | `pnpm build` passes                                                 |          |
| R6  |      YES | boundary/dep/security policy gates pass                             |          |
| R7  |      YES | desktop/iPad/iPhone browser smoke passes                            |          |
| R8  |      YES | external public-path browser smoke passes                           |          |
| R9  |      YES | service restart smoke passes                                        |          |
| R10 |      YES | launch report committed with deployed SHA and evidence              |          |
