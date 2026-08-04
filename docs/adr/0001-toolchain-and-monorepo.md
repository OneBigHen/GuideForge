# ADR 0001 — Toolchain and Monorepo Foundation

**Status:** Accepted
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 01 — Universal Foundation

## Context

GuideForge needs a monorepo foundation: package manager, build tooling,
TypeScript, React, routing/query, local-first storage, 3D, native desktop
wrapper, server, CI, and testing. The build pack requires exact pinned versions,
Context7-verified official documentation, and record of rejected alternatives.

## Current official documentation

Verified via Context7 and registry metadata on 2026-08-04:

| Tool                            | Exact version    | Source                                                                                                  |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| pnpm (workspaces, catalogs)     | 10.33.2          | pnpm.io (Context7 `/websites/pnpm_io`)                                                                  |
| Turborepo                       | 2.10.8           | npm registry `turbo`                                                                                    |
| TypeScript (strict)             | 6.0.3            | npm registry `typescript` (5.x/6.x line; 7.x native compiler is too new for typescript-eslint `<6.1.0`) |
| Vite                            | 8.2.0            | npm registry `vite` (engines: node ^20.19 \|\| >=22.12)                                                 |
| @vitejs/plugin-react            | 6.0.5            | npm registry (peer vite ^8)                                                                             |
| React / react-dom               | 19.2.8           | npm registry                                                                                            |
| @types/react / @types/react-dom | 19.2.18 / 19.2.4 | npm registry                                                                                            |
| TanStack Router                 | 1.170.18         | npm registry                                                                                            |
| TanStack Query                  | 5.101.4          | npm registry                                                                                            |
| Zustand                         | 5.0.14           | npm registry                                                                                            |
| Yjs                             | 13.6.32          | npm registry                                                                                            |
| y-indexeddb                     | 9.0.12           | npm registry                                                                                            |
| Dexie                           | 4.4.4            | npm registry                                                                                            |
| Workbox (InjectManifest)        | 7.4.1            | npm registry `workbox-build`                                                                            |
| Three.js                        | 0.185.1          | npm registry                                                                                            |
| @react-three/fiber              | 9.7.0            | npm registry (peer react >=19 <19.3, three >=0.156)                                                     |
| @react-three/drei               | 10.7.7           | npm registry (peer r3f ^9)                                                                              |
| @react-three/xr                 | 6.6.30           | npm registry                                                                                            |
| @tauri-apps/cli / api           | 2.11.4 / 2.11.1  | npm registry; tauri crate 2.11.5 (crates.io)                                                            |
| Fastify                         | 5.11.2           | npm registry                                                                                            |
| Drizzle ORM                     | 0.45.2           | npm registry                                                                                            |
| postgres (pg driver)            | 3.4.9            | npm registry                                                                                            |
| Hocuspocus server/provider      | 4.4.0            | npm registry                                                                                            |
| Vitest                          | 4.1.10           | npm registry                                                                                            |
| Playwright                      | 1.62.1           | npm registry                                                                                            |
| ESLint                          | 10.8.0           | npm registry (latest)                                                                                   |
| typescript-eslint               | 8.66.0           | npm registry (peer eslint ^8.57\|\|^9\|\|^10)                                                           |
| Prettier                        | 3.9.6            | npm registry                                                                                            |
| @changesets/cli                 | 2.31.1           | npm registry                                                                                            |
| @types/node                     | 26.1.2           | npm registry                                                                                            |

Tauri 2 official docs (Context7 `/websites/v2_tauri_app`): Vite frontend via
`beforeDevCommand`/`devUrl`/`frontendDist`; capability/permission model;
`tauri.conf.json` schema.

## Decision

1. **pnpm 10.33.2** with `pnpm-workspace.yaml` (workspace globs + version
   catalog for single-source-of-truth dependency versions).
2. **Turborepo 2.10.8** for task orchestration (`check`, `build`, `test`, `lint`,
   `typecheck`), with task dependencies and cached outputs.
3. **TypeScript 6.0.3** strict mode as the single language for all
   TypeScript/TSX. TS 7.0.2 (native) rejected: `typescript-eslint` supports
   `<6.1.0`; native compiler still early for the full plugin ecosystem.
4. **Vite 8.2.0 + @vitejs/plugin-react 6.0.5** for `apps/web`; Workbox
   `InjectManifest` in Phase 03 for the PWA.
5. **React 19.2.8** with R3F 9.7.0 / Drei 10.7.7 / XR 6.6.30 (all peer-compatible
   with React 19).
6. **Tauri 2.11** as a thin wrapper over the exact `apps/web` build
   (`frontendDist: ../web/dist`, `devUrl: http://localhost:1420` for the web app
   dev server). No second desktop React editor.
7. **Fastify 5 + Drizzle 0.45 + postgres 3.4** for `apps/api`; Hocuspocus 4.4
   for `apps/collab` (pinned, used in Phase 05).
8. **Vitest 4 + Playwright 1.62** for tests; ESLint 10 + typescript-eslint 8.66
   for lint; Prettier 3.9 for formatting; Changesets 2.31 for versioning.
9. Root scripts: `check` = format-check + lint + typecheck + test + build +
   boundary + dep-check (aggregated via turbo).

## Alternatives considered

### Alternative A — npm workspaces instead of pnpm

Benefits: zero extra tooling. Risks: slower installs, no content-addressed
store, weaker strictness (`node_modules` hoisting), no catalogs; the build pack
mandates pnpm. Rejected.

### Alternative B — TypeScript 7.0.2 (native compiler)

Benefits: fastest typechecking. Risks: `typescript-eslint` and several plugins
declare `<6.1.0`; ecosystem maturity risk on day one of a production build.
Rejected; revisit when typescript-eslint supports it.

### Alternative C — Vite 7 (previous major)

Benefits: more plugin maturity. Risks: Vite 8 is current `latest` with the
required peer set (`@vitejs/plugin-react` 6.0.5 targets vite ^8). Vite 8 keeps
the same config surface we need. Accepted Vite 8 with exact pin; fallback to 7.x
documented as a revisit trigger if a plugin fails.

### Alternative D — Electron instead of Tauri

Benefits: mature, Node in renderer. Risks: large binaries, higher memory,
slower startup, different security model; build pack mandates Tauri 2. Rejected.

## Consequences

### Positive

- Single catalog of exact versions; reproducible installs.
- Turbo task graph gives parallel, cached `check`/`build`/`test`.
- One web app is the canonical product for browser + Tauri + PWA.

### Negative

- New-major risk: Vite 8, ESLint 10, TS 6 — mitigated by exact pins and CI gates.
- Tauri native compile needs system webkit2gtk-4.1 dev libraries; the build
  sandbox has a read-only root filesystem, so native `cargo build`/`tauri build`
  cannot run here. The Tauri shell is scaffolded and configured to load the same
  `apps/web` build; native build is verified in CI/dev machines with the system
  deps (blocker documented in Phase 01 report).

### Security/privacy

- No secrets in any config. All `.env*` ignored; only `.env.example` committed.
- Dependency scan (npm audit + license + SBOM) gates in CI.

### Browser/device

- React 19 + Vite 8 targets modern evergreen browsers; PWA added Phase 03.
- Three 0.185 / R3F 9 / Drei 10 / XR 6 peer-compatible with React 19.

### Data migration

- None yet; catalog pins future migration surface. Workspace boundaries prevent
  domain packages from importing framework code.

### Operations

- `pnpm check` is the single gate; CI runs the same command.

## Acceptance evidence

- `pnpm check` passes in Phase 01 (format, lint, typecheck, unit tests, build,
  boundary, dependency checks).
- Same `apps/web` build is the `frontendDist` for `apps/desktop` Tauri config.
- Workspace cycle detection enforced by pnpm (cycles disallowed) + eslint
  boundary rules.

## Revisit trigger

- Upgrade TypeScript to 7.x once typescript-eslint supports it.
- Downgrade Vite to 7.x if the Phase 03/04 plugin stack (PWA/three) hits an
  incompatibility with Vite 8.
