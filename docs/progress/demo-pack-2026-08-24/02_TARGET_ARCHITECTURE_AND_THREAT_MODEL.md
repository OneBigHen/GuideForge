# Target Architecture and Threat Model

## Target request flow

```text
Internet
   |
   v
Cloudflare
  - DNS / TLS
  - Tunnel
  - WAF / rate limiting
  - Turnstile
  - Access on owner-only paths
   |
   v
guides.henning.rodeo
   |
   v
GuideForge reverse proxy (single public origin)
  |-------------------------------|
  |                               |
  v                               v
Static/PWA                    Internal services
public demo UI               - API
owner UI                     - collab
                              - optional Companion
                              - Postgres/SQLite as applicable
                                   |
                                   v
                             Cloudflare AI Gateway
                              - request analytics
                              - rate/spend limits
                              - payload logging OFF
                                   |
                                   v
                               OpenRouter
```

## Trust level A — anonymous public visitor

Allowed:

- load landing page;
- launch a deterministic demo guide;
- receive a **browser-local clone** of demo content;
- view demo assets;
- run/complete demo steps locally;
- run demo training locally;
- invoke a narrowly scoped public AI demonstration after Turnstile verification and within quotas.

Not allowed:

- enumerate owner library;
- access settings/secrets/signing keys;
- import arbitrary packages into canonical owner state;
- run source synthesis against owner sources;
- join owner collaboration rooms;
- mutate owner guides;
- select arbitrary providers/models;
- specify arbitrary remote provider URLs;
- bypass public AI cost/input/output ceilings.

## Trust level B — owner

Allowed:

- full library/asset/source/scene/editor functionality;
- real AI proposal and synthesis workflows;
- configuration of provider credentials;
- exports/backups/releases/signing;
- collaboration/admin if still required.

Required controls:

- real credential or identity-aware access;
- Secure/HttpOnly session;
- CSRF/origin checks;
- owner-only Cloudflare Access policy for high-impact paths;
- audit of expensive AI calls;
- provider spend ceilings;
- no secret values returned to browser after storage.

## Trust level C — internal service

API, collab, Companion, databases, and model-proxy plumbing are not Internet-facing services. They should accept traffic only from expected local/container reverse-proxy sources.

## Public route model

Prefer explicit public routes rather than making the entire existing application anonymous.

Suggested:

```text
/                           public landing
/demo                       public demo launcher
/demo/guide                 public sample guide
/demo/run                   public local run player
/demo/training              public local training
/api/demo/ai-proposals      public bounded AI endpoint
/api/demo/turnstile         optional token/session bootstrap

/library                    owner-only
/assets                     owner-only
/edit/*                     owner-only
/sources/*                  owner-only
/scene/*                    owner-only
/settings                   owner-only
/jobs                       owner-only
/photo-to-3d                owner-only
/api/guides/*               owner-only
/api/settings/*             owner-only
/api/signing-*              owner-only
```

A route restructure is acceptable if the existing SPA requires it, but keep the boundary explicit and testable.

## Anonymous demo state model

The public demo should not create server-side user accounts.

On first launch:

1. Load versioned sample fixture from bundled static JSON/package.
2. Validate fixture.
3. Import/clone it into the browser's local GuideForge storage under a deterministic demo marker/version.
4. Seed needed procedural assets idempotently.
5. Let the visitor edit/run locally if desired.
6. Never sync that visitor's modifications into owner canonical storage.

This gives a real interactive product experience without implementing tenant isolation.

## Public AI model

The anonymous endpoint can accept a **bounded** subset of the visitor's local demo guide:

- maximum step count;
- maximum characters per step;
- maximum total payload bytes;
- no URLs;
- no file uploads;
- no provider/model input from client;
- no system-prompt override;
- fixed cheap model allowlist;
- fixed max output tokens;
- low maximum cost per request;
- Turnstile token required;
- per-IP + anonymous demo session quota;
- global spend ceiling;
- stateless response only;
- no server persistence of generated content;
- no tool execution.

The response returns proposals/citations/receipt metadata. The browser may apply accepted proposals to the local clone.

## Threats and controls

| Threat                             | Primary controls                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Bot drains LLM credits             | Turnstile, Cloudflare rate limit, app quota, AI Gateway spend limit, provider cap, global kill switch |
| Bot bypasses UI and POSTs endpoint | Server-side Turnstile Siteverify, origin validation, request schema/size limits                       |
| Credential stuffing owner login    | Cloudflare Access, Argon2id owner auth, edge + app failed-login limits                                |
| UUID guessed/reused as owner       | Do not treat owner UUID as credential                                                                 |
| Prompt injection                   | No tools, no secret context, fixed system prompt, schema validation, bounded demo input               |
| SSRF through model/provider config | Existing model-gateway provider URL allowlist; no public provider URL inputs                          |
| Canonical owner data mutation      | public API has no mutation path to owner storage; browser-local demo clone                            |
| Secret leakage                     | server-only provider keys, encrypted Companion storage, AI Gateway payload logging disabled           |
| Unexpected cost spike              | per-call budget + per-client budget + global daily budget + AI Gateway spend limits                   |
| Crypto APIs missing                | HTTPS-only supported deployment + explicit secure-context feature check                               |
| Direct origin exposure             | Cloudflare Tunnel + firewall + no public backend ports                                                |
| Service restart resets limiter     | persistent quota/accounting or edge limits remain authoritative                                       |
| Malicious package/file             | owner-only imports; existing package/model inspection; size/type gates                                |
| Signing key theft                  | Companion owner-only, encrypted at rest, no anonymous route, file permissions                         |
| XSS steals session                 | CSP, HttpOnly cookies, dependency hygiene, no secret values in DOM                                    |
| CSRF                               | SameSite cookie + allowed Origin check + Access/owner auth                                            |
| Logs capture personal/prompts      | metadata-only AI Gateway logging; redact application logs                                             |
