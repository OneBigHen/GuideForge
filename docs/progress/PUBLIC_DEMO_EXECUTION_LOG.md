# GuideForge Public Demo Build — Execution Log

Branch: `feat/public-demo`. Plan of record:
`docs/progress/demo-pack-2026-08-24/13_MASTER_IMPLEMENTATION_PLAN.md`.

This log is an honest record of progress, incidents, and deferrals. It is
updated at every phase boundary and after every environment incident.

## Environment incident history

### Crash #1 (pre-checkpoint)

The LXC host (8 GB RAM; ~4.5 GB already consumed at boot by unrelated
production containers) hit the OOM watchdog during Phase 1 work while headless
Chrome sessions and turbo/pnpm fan-outs ran concurrently. The host rebooted.
Uncommitted work was lost; no repo state was corrupted.

### Crash #2 (during Phase 1 continuation)

A second OOM-reboot occurred during the Phase 1 continuation run. Work
survived because it had been checkpoint-committed as `bff7b19`
(`wip(phase1)`), which became the only commit on `feat/public-demo`.

**Standing resource rules adopted after crash #2** (violations caused both
crashes):

1. One heavy process at a time; never overlap browser sessions with test or
   build runs.
2. chrome-devtools browser pages are closed immediately after each use;
   browser evidence is captured sparingly in favor of unit tests wherever the
   plan permits.
3. Per-phase verification uses focused single-package test invocations only;
   no repo-wide turbo fan-outs between phases.
4. Repo-wide quality gates run exactly once, in Phase 7, with no browser open.
5. Before any heavy command, `free -m` must show ≥1500 MB available; otherwise
   wait and recheck.
6. The Vite dev server runs only when live-app evidence is explicitly required
   and is killed immediately afterwards.
7. OOM-killed commands are retried at reduced scope, never bigger.

Note: `/tmp/gf-driver.md` did not survive crash #2 (tmpfs cleared); the mission
was reconstructed from `docs/progress/demo-pack-2026-08-24/` plus the
checkpoint commit.

## Recovery verification after crash #2 (2026-08-25)

- Diff-reviewed checkpoint `bff7b19`: coherent Phase 1 slice —
  `SecureContextRequiredError` (named, coded error) in `packages/storage-web`,
  central `browserCapabilities.ts` probe with actionable messaging,
  idempotent `ensureSeedCatalog()` with CC0/procedural provenance,
  `/assets` storage-status panel + "Load demo asset catalog" action, tests at
  every layer, plus Task 1.1 reproduction evidence
  (`docs/progress/evidence/phase1/`).
- Re-ran focused suites post-reboot (per rules, sequentially):
  - `@guideforge/storage-web` vitest: **15/15 passed**.
  - `@guideforge/web` vitest: **12 files / 45 tests passed** — matches the
    pre-crash record exactly.
- Checkpoint finalized (amended locally; branch has never been pushed) into
  the pack-prescribed commit message
  `fix(assets): require secure context and seed demo catalog`.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 1 — Asset library / secure context | Code complete; HTTPS E2E deferred to Phase 7 gate | Unit suites above + LAN-HTTP repro screenshot; Task 1.6 requires the deployed HTTPS origin, which does not exist until Phase 5–6 |
| 2 — Demo guide from zero state | Complete (2026-08-25) | Focused suites: commands 11/11, storage-web 15/15, web 14 files / 56 tests; typecheck + lint clean on all touched packages |
| 3 — Real AI is honest | pending | — |
| 4 — Anonymous demo AI seam | pending | — |
| 5 — Owner trust boundary | pending | — |
| 6 — Production compose + Cloudflare | pending | — |
| 7 — Release verification | pending | — |

### Phase 2 notes (2026-08-25)

- Searched repo/host once more for an existing shareable "Get to Know Andrew"
  fixture before building one; none found. Built the synthetic fixture with an
  explicit fictional-framing disclaimer (no facts about a real person).
- Added a first-class `guide/add-step-media` command (payload + pure reducer +
  tests) because commands are the only sanctioned guide mutation mechanism;
  asset attachment must not bypass the command bus.
- Demo guide is built through the normal stack only: Yjs working doc via
  command bus, real ingestion pipeline (`addSource`) for the bundled
  `demo-andrew-profile.md` source, content-addressed procedural assets from
  `SEED_CATALOG`, canonical training program replace.
- All demo entity ids are fixed UUIDs and command timestamps are fixed, so the
  seeded snapshot is byte-deterministic across runs.
- Idempotence/ownership rules honored: existing local demo copy (even
  visitor-modified) is never overwritten implicitly; `resetDemoGuide()` is the
  explicit destructive path (two-step confirmation in `/demo` UI).
- `/demo` route: headline, Launch action, three proof points, local-data reset,
  no admin/settings controls. Library offers "Install demo guide" at zero
  guides. Honest AI claim: none made yet — "Real AI available" status arrives
  with Phase 3's capability surface, per the spec's "only if health is green".
- Browser evidence: launch flow covered by jsdom router test
  (`src/routes/-demo.test.tsx` asserts navigation to `/run/<demo-id>` after
  seeding). Per standing resource rules, live-browser capture is deferred to
  Phase 7's external verification instead of running headless Chrome here.

