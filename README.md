# GuideForge Universal

Local-first, self-hosted, spatial work-instruction platform. One universal
application: complete authoring on desktop browser and iPad, execution and
review on iPhone, and a thin Tauri 2 desktop wrapper around the same web app.

## Repository

```text
apps/web          Canonical browser/PWA product
apps/desktop      Thin Tauri 2 wrapper (loads apps/web build)
apps/api          Fastify control plane (Phase 05)
apps/collab       Hocuspocus Yjs service (Phase 05)
packages/...      Framework-independent domain, schema, editor, storage, packaging
services/docling  Pinned document-extraction worker (Phase 06)
```

See `docs/UNIVERSAL_BUILD_SPEC.md` (authoritative), `AGENTS.md` (operating
rules), and `docs/adr/` (decision records).

## Development

Prerequisites: Node.js ≥ 22.12, pnpm 10.33.2.

```bash
pnpm install
pnpm check        # format + lint + typecheck + tests + build + boundaries + deps
pnpm dev          # run apps/web dev server
```

## Desktop (Tauri)

`apps/desktop` is a thin wrapper: `frontendDist` points at the `apps/web`
build, so browser and desktop always render the same application. Building the
native shell requires Tauri system libraries (webkit2gtk-4.1 on Linux); see
`apps/desktop/src-tauri/tauri.conf.json`.
