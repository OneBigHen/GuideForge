# ADR 0005 — Control Plane, Identity, Collaboration, and Governance

**Status:** Accepted
**Date:** 2026-08-04
**Owners:** GuideForge build agent
**Related phase/issue:** Phase 05

## Context

GuideForge needs optional self-hosted collaboration and governed release
workflows: authorized multi-device convergence, review/approval with
append-only audit, and a deployment story. The legacy prototype used a shared
frontend API key and unsynchronized dual stores.

## Current official documentation

Verified via registry metadata 2026-08-04:

| Technology                             | Exact version                    |
| -------------------------------------- | -------------------------------- |
| fastify                                | 5.11.2                           |
| @fastify/cors / cookie / jwt / swagger | 11.3.0 / 11.1.2 / 10.2.1 / 9.5.1 |
| drizzle-orm / drizzle-kit              | 0.45.2 / 0.31.10                 |
| pg                                     | 8.22.0                           |
| @hocuspocus/server                     | 4.5.0                            |
| postgres (docker)                      | 17-alpine                        |

## Decision

1. **Identity**: BFF session (HttpOnly cookie + signed JWT). OIDC authorization
   code + PKCE is the provider adapter seam; the session contract is
   provider-independent.
2. **RBAC**: action/resource permissions resolved from organization/workspace
   roles; `requirePermission` fails closed with 403.
3. **Room tickets**: HMAC-SHA256 signed, expiring (default 300s), single-use
   nonce, timing-safe compare. The collab service verifies signature, expiry,
   and that the room (document name) equals the ticket's guideId. Unauthorized
   rooms fail closed with no data exposure.
4. **Collaboration**: Hocuspocus server; Yjs updates are the only persisted
   content; awareness is ephemeral. Optional Postgres persistence.
5. **Governance**: review → approve sets lifecycle `approved`; any content
   change returns the guide to `draft`, invalidating prior approvals while
   retaining them in the append-only audit.
6. **Deployment**: Docker Compose with postgres 17, api, collab, and web
   behind nginx (service-worker no-cache; proxy to api + collab websocket).

## Alternatives considered

### Alternative A — shared API key (legacy)

Rejected: browser-embedded bearer secret, no identity, no per-resource
authorization.

### Alternative B — direct WebSocket with user credentials

Rejected: credentials in every WS handshake; room tickets give short-lived
scoped access without storing long-lived tokens client-side.

### Alternative C — no server metadata (pure P2P)

Rejected: no governance/audit, no release workflow, no org model.

## Consequences

### Positive

- Two authorized devices converge; offline edits reconnect without loss.
- Unauthorized room access fails closed.
- Audit is append-only; content change invalidates approval.
- Compose deployment boots and serves OpenAPI.

### Negative

- Postgres is a hard dependency for the control plane (acceptable for a
  self-hosted stack; offline single-user mode still works client-only).
- Real OIDC provider wiring still requires a live IdP (deferred, documented).

### Security/privacy

- Tickets short-lived + signed; BFF cookie HttpOnly; secrets env-only.
- RLS policy migration remains (Phase 08 hardening).

### Data migration

- Drizzle migration 0000; schema versioned; collab `yjs_documents` table.

### Operations

- `pnpm check` covers api (11 tests on real Postgres) + collab (4 tests over a
  real WebSocket server).

## Acceptance evidence

- Collab: convergence, offline reconnect, wrong-room rejection, missing-ticket
  rejection.
- API: ticket issuance (authorized) / 403 (operator), review→approve audit
  append-only, content change → draft + approval retained.
- Compose: `docker compose config --quiet` passes; api boots and serves
  `/health` + `/openapi.json`.

## Revisit trigger

- Wire a live OIDC IdP and add JWKS/PKCE fixture tests.
- Add S3 object storage with hash-verified upload (Phase 07).
