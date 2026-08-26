# Phase 5 — Public Deployment at guides.henning.rodeo

**Outcome:** one HTTPS public origin through the existing Cloudflare Tunnel, with internal services hidden.

## Existing infrastructure fact

The repo already contains:

```text
docs/deploy/PUBLIC_LAUNCH_guides_henning_rodeo.md
```

That runbook identified the current `atlas` Cloudflare Tunnel as the intended tunnel and explicitly warned not to attach new routes to the deprecated legacy tunnel.

Re-validate current host state before editing shared infrastructure.

## Task 5.1 — production Compose profile

Create a production-specific Compose contract rather than relying on development defaults.

Goals:

- only web/reverse-proxy needs a host binding;
- API/collab/companion use Docker-internal networking;
- secrets are required, not `change-me-*` defaults;
- health checks on critical services;
- restart policies;
- persistent volumes;
- environment values injected from ignored env/secrets.

If keeping Postgres API for launch, keep it internal.

If adding Companion, do it as a separate reviewed task with safe proxy-aware transport; do not disable TLS checks globally.

## Task 5.2 — reverse proxy

`infra/docker/nginx.conf` is the same-origin seam.

Required production behavior:

- `/` -> web/PWA;
- `/api/` -> API;
- `/collab/` -> websocket collab;
- owner-only Companion path only if needed;
- preserve websocket upgrade;
- correct `Host`;
- correct trusted client/proxy headers;
- request body size limits by route;
- security headers.

Recommended headers at reverse proxy/edge:

```text
Strict-Transport-Security
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy
Permissions-Policy
frame-ancestors via CSP
```

CSP must be built from actual application needs; do not copy a restrictive policy that breaks workers, WebGL, blobs, or required model rendering.

## Task 5.3 — production session security

Create explicit production configuration.

Required:

- `Secure` owner cookie;
- `HttpOnly`;
- intentional SameSite;
- known production CORS origin exactly `https://guides.henning.rodeo`;
- trusted proxy handling tested;
- CSRF Origin check uses external HTTPS origin;
- no wildcard production CORS.

## Task 5.4 — owner path protection with Cloudflare Access

Prefer path-specific Access around existing authoring/admin routes while leaving `/demo` public.

Protect at least:

```text
/library
/assets
/edit/*
/sources/*
/scene/*
/settings
/jobs
/photo-to-3d
```

Also protect full-power owner API paths if they are reachable independently of an application credential.

Do not accidentally protect static JS/CSS needed by the public demo.

## Task 5.5 — Cloudflare Tunnel

Route:

```text
guides.henning.rodeo -> the GuideForge reverse proxy/web service
```

Do not create independent public hostnames for API, collab, Postgres, or Companion for this demo.

Validate tunnel config before restart.

## Task 5.6 — origin firewall

If practical on the host:

- backend ports not published;
- host firewall prevents Internet/LAN access to internal service ports;
- SSH restricted to intended management network/Tailscale;
- Cloudflare Tunnel remains the public path.

## Task 5.7 — production environment

Use `production.env.example` from this pack as a contract.

Actual values live in ignored env/secrets storage.

**Phase gate:** `https://guides.henning.rodeo` works externally; direct backend ports are not public; owner paths require owner gate; demo remains public.
