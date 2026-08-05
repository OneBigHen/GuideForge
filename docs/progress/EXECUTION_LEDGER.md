# GuideForge Execution Ledger

One row per meaningful work item. Status values: planned / active / blocked /
verified / rejected / superseded.

| ID     | Phase | User outcome                                 | Status   | Evidence                                              | Commit        | Risk | Follow-up          |
| ------ | ----- | -------------------------------------------- | -------- | ----------------------------------------------------- | ------------- | ---- | ------------------ |
| P00-1  | 00    | Branch + agent rules installed               | verified | baseline commit `066ee0d`                             | 066ee0d       | low  | —                  |
| P00-2  | 00    | Re-audit + capability matrix                 | verified | `docs/progress/CAPABILITY_MATRIX.md`                  | 4a618e2       | low  | —                  |
| P00-3  | 00    | Clean frozen install + 100/100 forced check  | verified | `pnpm check --force`                                  | 4a618e2       | low  | —                  |
| P00-4  | 00    | CI E2E + Postgres + policy gates + secrets   | verified | `.github/workflows/ci.yml`                            | 4a618e2       | low  | gitleaks token     |
| P00-5  | 00    | No-credential AI test + baseline perf report | verified | model-gateway tests; `BASELINE_PERFORMANCE_REPORT.md` | 4a618e2       | low  | —                  |
| P00-6  | 00    | Phase 00 report + ADR 0009                   | verified | `PHASE_00_REPORT.md`                                  | 4a618e2       | low  | —                  |
| P01-1  | 01    | Single-owner session (no body roles)         | verified | api tests (17/17)                                     | (this commit) | low  | network owner mode |
| P01-2  | 01    | Stable audit org context                     | verified | api audit test                                        | (this commit) | low  | —                  |
| P01-3  | 01    | Approval content-hash invalidation           | verified | api regression test (409)                             | (this commit) | low  | —                  |
| P01-4  | 01    | Real SHA-256 everywhere                      | verified | domain vectors; gateway/interop/api/web hashes        | (this commit) | low  | —                  |
| P01-5  | 01    | Adapter constructor-key retention            | verified | model-gateway tests (13/13)                           | (this commit) | low  | —                  |
| P01-6  | 01    | Deep validation + zero-citation rejection    | verified | ai-contracts + gateway tests                          | (this commit) | low  | —                  |
| P01-7  | 01    | Proposal provenance retained                 | verified | web proposals test; Dexie v3                          | (this commit) | low  | —                  |
| P01-8  | 01    | Provider/fallback visible in UI              | verified | ProposalsPanel provider badge                         | (this commit) | low  | —                  |
| P01-9  | 01    | Signing keys out of localStorage             | verified | unsigned personal release; package tests (32/32)      | (this commit) | low  | companion signing  |
| P01-10 | 01    | Bounded zip preflight                        | verified | preflight tests (zip bomb/traversal)                  | (this commit) | low  | worker extraction  |
| P01-11 | 01    | CSRF + rate limits + loopback default        | verified | api CSRF/rate tests                                   | (this commit) | low  | —                  |
| P01-12 | 01    | Draft export downloads                       | verified | edit route handler                                    | (this commit) | low  | e2e                |
| P01-13 | 01    | Stale hierarchy selection fixed              | verified | scene route nodeIds                                   | (this commit) | low  | —                  |
| P01-14 | 01    | Companion status pill truthful               | verified | AppShell probe                                        | (this commit) | low  | —                  |
