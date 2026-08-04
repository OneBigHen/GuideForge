# Security and Contamination Audit

Reference: `gsk-tech/Guides-Studio` @ `ef07a2708991a1cd1797f3e428b313b2f2570ec3`
Audit date: 2026-08-04
Method: read-only scans over the preserved reference worktree
(`~/Vibe/Guides-Studio-reference`), tracked files only.

## 1. Secret scan

Patterns searched: AWS access keys, private keys (RSA/EC/OpenSSH/PGP),
GitHub PATs (`ghp_`), OpenAI-style keys (`sk-`), Google API keys (`AIza`),
Slack tokens (`xox*`), `VITE_API_KEY`, `API_KEY=`/`API_KEY:` assignments.

Matches (all benign templates or design flaws, no live secrets):

| File | Finding |
|---|---|
| `.env.example` | `VITE_API_KEY=your-secure-api-key-here-change-me` — placeholder, not tracked as real value |
| `backend/.env.example`, `backend/.env.production.example` | `API_KEY=CHANGE_ME...` placeholders |
| `CLAUDE.md` | Documentation of the `VITE_API_KEY` mechanism |
| `services/localDatabase.ts:34` | Reads `VITE_API_KEY` from `import.meta.env` — the shared-key design flaw to replace |
| `prepare-portable.ps1` | Sets `VITE_API_KEY` from env at build time |

Conclusion: **No real secrets committed.** The `VITE_API_KEY` mechanism itself is
a design flaw (browser-bundle bearer secret) and is on the replace list.

## 2. Large / generated / runtime file inventory (tracked)

| Path | Size | Verdict |
|---|---|---|
| `Sample_Guide.guide` | 19.2 MB | Cleaned demo fixture (see §5); fixture-only reuse |
| `package-lock.json`, `backend/package-lock.json` | ~0.5 MB | Dependency locks; do not copy into new repo (new toolchain) |
| `backend/uploads/.gitkeep` | — | Empty dir marker; uploads themselves are untracked |

No `node_modules`, `dist/`, `*.sqlite`, binaries, archives (other than the
fixture), certs, or keys are tracked.

## 3. Database / upload / runtime scan

- `backend/database/guides.sqlite*` (WAL/SHM) — **untracked** runtime artifact in
  the live working copy; excluded from the reference worktree and must never be copied.
- `backend/uploads/*` — **untracked** uploaded content; excluded, must never be copied.
- `dist/` — **untracked** build output; excluded.
- `.env` (live) — **untracked**; excluded.
- `node_modules/`, `backend/node_modules/` — **untracked**; excluded.
- `.claude/`, `.codegraph/`, `frontend.log`, `build.log` — untracked agent/run
  artifacts; excluded.

Verdict: the tracked reference is clean of runtime state; the untracked runtime
state exists only in the live working copy and is deliberately not part of the
reference. No database, upload, certificate, or environment file enters GuideForge.

## 4. Customer / GSK identifier scan

- `README.md:13` references the `gsk-tech/Guides-Studio` GitHub org — provenance
  note, no customer data.
- `guide_format_spec.md`, `scripts/clean_sample_guide.py` mention "Dataverse"
  generically and the *scrubbing* of a real tenant URL.
- `services/exporter.ts:167` contains a hard-coded tenant-style URI
  (`orga2a95488.crm.dynamics.com`) — **this is the contamination/design defect**
  to eliminate; GuideForge must never contain tenant URIs.
- No GSK branding, logos, or customer documents are tracked.

## 5. Fixture license / provenance

- `Sample_Guide.guide` was scrubbed by the legacy repo itself
  (`scripts/clean_sample_guide.py`): tenant URL → `contoso.crm.dynamics.com`,
  original guide GUID replaced. Name: "Andrew+ Pipetting Robot Guide".
- Treated as a legally cleaned generic demo fixture; reuse only inside
  `packages/test-fixtures` after a fixture-reuse note, and never in production
  bundles or documentation branding.

## 6. Dependency / license summary (reference stack — for context only)

All production dependencies are MIT or permissive:
React (MIT), Three.js (MIT), `@react-three/fiber` (MIT), `@react-three/drei`
(MIT), `@react-three/xr` (license in repo), Express (MIT), `better-sqlite3`
(MIT), Multer (MIT). No GPL/AGPL copyleft packages. The new GuideForge
toolchain is chosen independently in Phase 01 (see ADR 0001) and its own
license/SBOM gates are recorded there.

## 7. Risks carried into GuideForge (all must be designed out)

1. Browser-bundle bearer API key (`VITE_API_KEY`) — replace with OIDC/BFF.
2. Silent IndexedDB↔SQLite fallback — replace with explicit Yjs sync states.
3. Mutable whole-guide object + `Map<string, Blob>` — replace with normalized
   entities, commands, content-addressed assets.
4. Hard-coded tenant URI in export — forbid entirely.
5. Snapshot-based versioning — replace with command history + immutable releases.
6. Unvalidated archive parsing (`js-untar`) — replace with sandboxed, bounded
   extraction with traversal/bomb defenses.
7. UA-string device branching — replace with capability detection.
