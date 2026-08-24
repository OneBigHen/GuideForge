# Phase 05 Report — Control Plane, Identity, Collaboration, and Governance

## Outcome

The optional self-hosted control plane is implemented and tested against a
real PostgreSQL: a Fastify BFF with RBAC, short-lived signed room tickets, a
Hocuspocus Yjs WebSocket service that fails closed on unauthorized rooms, an
append-only audit log, the review/approval workflow with content-change
invalidation, and a Docker Compose deployment that is syntactically valid and
whose components boot. Two authorized devices converge through Yjs; offline
edits reconnect without loss.

## Commits

- `(this commit)` feat: Phase 05 control plane, identity, collaboration, governance

## Delivered vertical slices

1. **apps/api (Fastify)**: `/health`, `/openapi.json`, BFF session
   (`POST/GET /api/session`, HttpOnly cookie + JWT), authorization-checked
   room-ticket issuance (`POST /api/rooms/:guideId/tickets`), review
   submission (`POST /api/guides/:guideId/review`), approval decision
   (`POST /api/reviews/:reviewId/decision`), append-only audit
   (`GET /api/guides/:guideId/audit`). Drizzle schema (organizations, users,
   memberships, workspaces, guides, reviews, approvals, audit_events,
   releases, room_tickets) + generated migration 0000.
2. **RBAC** (`auth/rbac.ts`): 9 roles × action/resource permissions;
   `requirePermission` throws → 403.
3. **Room tickets** (`auth/room-ticket.ts`): HMAC-signed, expiring, single-use
   nonce tickets; timing-safe compare; unit tested (valid, expired, tampered,
   wrong-secret, malformed).
4. **apps/collab (Hocuspocus)**: `buildCollabServer` verifies ticket signature
   - expiry + room match (`onAuthenticate`), fails closed; optional Yjs
     persistence to Postgres (`yjs_documents` table) via `server.ts` entry.
5. **Governance**: review → approve sets lifecycle `approved`; content change
   returns guide to `draft` (old approval recorded, new review required);
   audit events append-only for submit/approve.
6. **Deployment**: `infra/docker/docker-compose.yml` (postgres 17, api,
   collab, web/nginx with SW no-cache + proxy), Dockerfiles, nginx.conf.
7. **OIDC readiness**: BFF session model and provider adapter seam; real
   OIDC code+PKCE exchange is configuration-dependent (Phase 06/07 wiring).

## Acceptance evidence

| Gate                                             | Evidence                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Two authorized devices converge                  | collab test: provider A + B, title propagates                                                               |
| Unauthorized room access fails closed            | collab tests: wrong-room ticket + missing ticket both rejected                                              |
| Offline edits reconnect without replacement/loss | collab test: A writes offline → B connects and receives update                                              |
| Review and approval audit is append-only         | API test: submit + approve both in audit events list                                                        |
| Content change invalidates approval              | API test: lifecycle back to draft, prior approval retained                                                  |
| Fresh Compose deployment starts                  | `docker compose config --quiet` valid; api container boots, `/health` + `/openapi.json` OK against Postgres |

## Test results

- `pnpm check`: 65/65 tasks pass.
- api: 11 tests (room-ticket 5 + control-plane 6 against real Postgres 17).
- collab: 4 tests (convergence, offline reconnect, 2× authz) over a real
  WebSocket server.

## Responsive/device evidence

- N/A (server-side phase); client collaboration API is engine-neutral.

## Accessibility evidence

- N/A (no new UI in this phase).

## Security and privacy impact

- Room tickets are short-lived, signed, single-use; unauthorized rooms fail
  closed with no data exposure.
- BFF session cookie is HttpOnly; CSRF defense is a follow-up (sameSite=lax
  set; strict origin validation next phase).
- Secrets (`SESSION_SECRET`, `ROOM_TICKET_SECRET`) only via env; never in
  commits. Compose defaults are dev-only placeholders.
- Audit is append-only by design (no update/delete paths).

## Persisted schema and migration impact

- New `drizzle/0000_familiar_gateway.sql` migration; tables for orgs, users,
  memberships, workspaces, guides, reviews, approvals, audit, releases,
  room_tickets, and `yjs_documents` (collab).
- RLS (row-level security) migration is the next hardening step (Phase 08
  security), schema supports it.

## Context7/ADR updates

- ADR 0005 (control plane) added; versions verified via registry.

## Known limitations

- Real OIDC provider integration (discovery, JWKS, PKCE exchange) is
  configuration-dependent; the BFF session contract is ready, provider
  adapter needs a live IdP to finish (Phase 06/07 with a fixture-based test).
- Object storage (S3) upload with hash verification is designed but not yet
  implemented (Phase 07).
- RLS policy SQL not yet applied to the guides table.

## Blocked external dependencies

- None (Postgres runs via Docker; all gates pass with real DB).

## Next phase readiness

- READY. Phase 06 (Docling + AI proposal pipeline) can reuse the API/control
  plane for intake validation and usage receipts.

**Gate:** PASS
