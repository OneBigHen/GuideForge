# Public launch: guides.henning.rodeo

Requirements/runbook for a new session to take GuideForge public at
`guides.henning.rodeo`, written after investigating the actual host
(`docker-dev`) and its existing Cloudflare Tunnel infrastructure. Nothing
here was executed — this is deliberately a plan, not a deploy, because it
touches shared production infra (other live services on this host) and a
public domain. Read it fully before running anything.

## What's true about this host right now

- `docker-dev` is not a throwaway sandbox — it already runs several of
  Henning's real long-running services (jellyfin/print/paperclip proxies,
  marketplace stack, mentra-remote-assist, homepage dashboard, etc.). It's a
  legitimate target for a persistent GuideForge deployment.
- `henning.rodeo` is on Cloudflare (nameservers `luciane`/`theo`.ns.cloudflare.com).
  There are **two** Cloudflare Tunnels already running here — using the
  wrong one will either not work or will get your route removed later:
  - **`legacy-shared-services`** (`/etc/cloudflared/legacy-shared-services/`,
    tunnel `e5d6161f-e7c3-43d4-b6bf-7edf7c752b7f`) — its own README says
    explicitly: _"This stack owns legacy Cloudflare routes that must not be
    coupled to Atlas."_ **Do not add new hostnames here.**
  - **`atlas`** (`/etc/cloudflared/atlas/`, tunnel
    `cff6cea8-a7bf-440f-91c2-c07674da8bbf`) — the current/primary tunnel.
    Currently its `config.yml` ingress list has one entry
    (`atlas.henning.rodeo` → `http://proxy:80`). **This is the one to add
    `guides.henning.rodeo` to.**
- `guides.henning.rodeo` already resolves (to Cloudflare's anycast IPs), so
  DNS for it may already exist at the zone level — confirm in the Cloudflare
  dashboard (or `cloudflared tunnel route dns atlas guides.henning.rodeo`,
  which is safe to run even if the record already exists) before assuming
  you need to create a new record.
- `/etc/cloudflared/atlas/config.yml` is currently `0400` (read-only, not
  even writable by its own owner) — you'll need to adjust permissions (or
  edit as the owning user/root and re-lock it after) to add a route. Restart
  the atlas `cloudflared` container/service afterward for the new ingress
  rule to take effect. **This is live infra for `atlas.henning.rodeo` and
  whatever else routes through it — validate the edited config
  (`cloudflared tunnel ingress validate`) before restarting, and change
  only your own new ingress line.**

## The two backend options — pick one

GuideForge has two backend services and only one is actually
docker-compose-ready today:

|                                          | `apps/api`                                                                                                        | `apps/companion`                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Storage                                  | Postgres                                                                                                          | SQLite                                                                                          |
| Model                                    | org/workspace/RBAC ("enterprise heritage", flagged for removal in `PLAN_TONIGHT.md` Phase 4)                      | single-owner (matches `AGENTS_SINGLE_USER.md`, the current product direction)                   |
| `infra/docker/docker-compose.yml` wiring | **exists** — full stack: postgres + api + collab + nginx reverse-proxying `/api/` and `/collab/` under one origin | **does not exist** — no Dockerfile, no compose service, no nginx wiring                         |
| This session's security fix              | `apps/api/src/bind-guard.ts` now refuses to bind non-loopback without `GUIDEFORGE_OWNER_ID`                       | companion already refused non-loopback binds without TLS (pre-existing `assertTransportConfig`) |

**Recommendation:** ship with `apps/api` now (it's the only one that's
actually deployable today), track building companion's container/nginx
wiring as real follow-up work — don't try to build that from scratch in the
same session as a live public launch.

### Important: the existing compose stack's `/api` proxy is currently a no-op

`infra/docker/nginx.conf`'s `location /api/ { proxy_pass http://api:8080; }`
reaches the `api` container over the Docker bridge network — **not**
loopback. `apps/api` defaults to binding `127.0.0.1` (its own container's
loopback), so nginx's proxy currently can't reach it _even internally_,
independent of anything public. This was already true before this session's
changes (verified — it's the "dead port" GF4 flagged, not something newly
introduced). To make `/api` work at all, `infra/docker/.env` must set:

```
GUIDEFORGE_HOST=0.0.0.0
GUIDEFORGE_OWNER_ID=<a real, stable UUID you choose for yourself as owner>
```

Do this **before** anything is reachable from the internet — the whole point
of this session's fix is that the server now refuses to boot in this
combination without an explicit owner, instead of silently minting whoever
connects first as `organization-owner`.

## Step-by-step

1. **Choose and record an owner identity.** Generate a UUID for
   `GUIDEFORGE_OWNER_ID`. This is the only `userId` that will ever be able
   to open a session once this is network-reachable.
2. **Populate `infra/docker/.env`** from `infra/docker/.env.example`:
   - `GUIDEFORGE_HOST=0.0.0.0`, `GUIDEFORGE_OWNER_ID=<from step 1>`
   - `SESSION_SECRET` / `ROOM_TICKET_SECRET` — real random values, not the
     `change-me-*` defaults (the compose file's own header warns about this)
   - `POSTGRES_PASSWORD` — real random value
   - `OPENROUTER_API_KEY` — real key, for AI features to work at all. Not
     something I can supply; you'll need to provide it directly into the
     ignored `.env` file, never into a prompt or committed file.
   - `CORS_ORIGIN` — change from `http://localhost:1420` to
     `https://guides.henning.rodeo`
3. **Build and start the stack:** `docker compose -f infra/docker/docker-compose.yml up -d --build`
   from the repo root (or point `context:` correctly if run from elsewhere).
4. **Verify locally first**, before touching the tunnel:
   `curl http://192.168.1.40:1420/` and `curl http://192.168.1.40:1420/api/health`
   should both succeed from the host.
5. **Add the Cloudflare ingress rule** in `/etc/cloudflared/atlas/config.yml`,
   above the trailing `- service: http_status:404` catch-all:
   ```yaml
   - hostname: guides.henning.rodeo
     service: http://192.168.1.40:1420
   ```
   Validate with `cloudflared tunnel --config /etc/cloudflared/atlas/config.yml ingress validate`,
   then restart just the atlas cloudflared container.
6. **Confirm DNS** — check whether `guides.henning.rodeo` needs its own
   record or is already covered by an existing zone-level route (see "What's
   true about this host" above).
7. **Smoke test from outside the LAN** (phone on cellular data, or any
   off-network device): `https://guides.henning.rodeo/` should load with a
   real, browser-trusted certificate (Cloudflare issues/manages this — no
   self-signed cert step needed with the Tunnel approach).
8. **Claim ownership through the UI** before telling anyone else the URL
   exists — confirm the `/api/session` flow only accepts the configured
   `GUIDEFORGE_OWNER_ID` and rejects everything else (there's already a test
   for this: `apps/api/src/index.test.ts` — "network mode denies sessions
   for non-owner identities").

## Before calling it actually "public"

This app's whole architecture assumes a single owner, not a multi-tenant
audience — "public" here most likely means "reachable from anywhere for me
to use," not "open to strangers as a shared product." Worth confirming that
framing explicitly, since the two imply very different follow-up work
(rate limiting is already present; things like public sign-up flows,
abuse handling, and multi-tenant data isolation are not, and were never
built — this is a single-owner app by design, see `AGENTS_SINGLE_USER.md`).

Known, previously-documented residual risks worth a look before wider
exposure (see `docs/progress/GF4_RELEASE_REPORT.md` and
`docs/progress/CLAUDE_SESSION_WORKLOG.md` for the full detail, current as of
this session):

- Release-package signature verification supports pinning now
  (`TrustedKeyStore`, this session's fix), but no real consumer passes a
  trust store yet — only matters if you distribute signed `.gforge` files to
  other people, not for your own use.
- The same silent-data-loss pattern this session fixed for guide _sources_
  still exists, unfixed, for claims/citations/generation-runs provenance.
- Physical device testing (iPad/iPhone/Pencil/camera) has never been done —
  only Playwright-emulated viewports in CI.

---

## Production profile (demo pack Phase 6, added 2026-08-25)

The development compose file stays as-is for local work. The public launch
uses a hardened production contract instead:

```text
infra/docker/docker-compose.prod.yml   # prod services; secrets REQUIRED
infra/docker/nginx.prod.conf           # same-origin seam + security headers
docs/progress/demo-pack-2026-08-24/production.env.example   # env contract
```

Key differences from dev compose:

1. **No backend host publishing.** Only `web` binds out, on loopback only
   (`127.0.0.1:8787->80`) as the tunnel origin. postgres/api/collab are
   Docker-network-only.
2. **Secrets required, not defaulted.** `${VAR:?}` interpolation refuses to
   start without real values. Copy `production.env.example` to an IGNORED
   `infra/docker/.env.production` and fill it from your secret store.
3. **Owner credential is mandatory in network mode.** Since commit
   `fix(auth): enforce real owner credential at public boundary`, the API
   refuses to boot with `GUIDEFORGE_OWNER_ID` but no
   `GUIDEFORGE_OWNER_PASSWORD`; sessions additionally require that password
   (timing-safe compare). This supersedes step 1/8 above: record BOTH values.
4. **Secure cookies by default.** HTTPS-only CORS origins flip the session
   cookie's `Secure` flag automatically; `SESSION_COOKIE_SECURE=true` pins it.

### Deployment order (unchanged tunnel, validated first)

1. Fill `.env.production` (never commit it).
2. `docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.production up -d --build`
3. Local origin check: `curl http://127.0.0.1:8787/` and
   `curl http://127.0.0.1:8787/api/health`.
4. Atlas tunnel ingress (validate before restart):
   ```yaml
   - hostname: guides.henning.rodeo
     service: http://127.0.0.1:8787
   ```
5. Cloudflare dashboard, zone `henning.rodeo`:
   - **Access** (self-hosted app) protecting owner paths ONLY:
     `/library`, `/assets`, `/edit/*`, `/sources/*`, `/scene/*`,
     `/settings`, `/jobs`, `/photo-to-3d` — leave `/demo`, `/run/*`,
     `/training/*` and all static assets public.
   - **Turnstile**: create widget for guides.henning.rodeo; site key +
     secret go into `.env.production` (`AI_PUBLIC_DEMO_ENABLED=true`).
   - **WAF rate rules**: challenge unknown user agents on `/api/demo/*`;
     block non-Cloudflare IPs from reaching the origin if not already.
   - **AI Gateway**: create gateway `guideforge`; set logging to
     metadata-only (payload collection disabled); point spend limits at the
     same $2/day cap as `AI_PUBLIC_DAILY_BUDGET_USD`.
6. External smoke per `12_ACCEPTANCE_MATRIX.md`.

### Rollback

`docker compose -f infra/docker/docker-compose.prod.yml down` removes only
GuideForge containers/volumes named `guideforge-*`; the atlas ingress line
is additive and can be deleted alone. No shared host state is modified.
