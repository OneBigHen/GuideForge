# Browser-Only and Companion Modes (Phase 01)

## Browser-only offline mode (primary)

`apps/web` is the canonical product and works with **no server**:

- create/edit guides (Yjs local working doc);
- spatial editing with local/imported assets;
- offline playback and procedure execution;
- local training (Phase 07/08);
- package import/export (`createDraftPackageAsync`, `importDraft`);
- deterministic validation and citation display;
- **no provider keys, no signing keys, no server** — the UI identifies which
  features need the companion and never pretends an external provider ran.

AI proposals in browser-only mode are produced by the deterministic local
gateway and labeled **"offline deterministic"** in the proposals panel. The
panel never claims a live provider ran when it did not (Phase 01 provider
transparency).

Personal releases exported from the browser are **unsigned** (the manifest
declares `signed: false`) and the XR viewer shows a trust warning. Signing
keys never exist in browser storage.

## Companion mode (optional local/self-hosted)

`apps/api` acts as the single-owner companion when it is reachable:

- **DeepSeek proxy**: `POST /api/guides/:guideId/ai-proposals` runs the real
  adapter server-side (key in `DEEPSEEK_API_KEY`, never in the browser) and
  returns proposals + citations + a full provider receipt.
- **Docling** conversion (pinned local venv worker).
- **Identity**: single-owner session; roles are server-derived
  (`organization-owner`), never accepted from the request body.
- **Hardening** (Phase 01): loopback bind by default; explicit
  `GUIDEFORGE_OWNER_ID` for network mode; Origin check on cookie-authenticated
  writes (CSRF); per-IP/per-user rate limits on session and AI routes.

### Network owner mode

Exposing the companion beyond loopback requires all of:

1. `GUIDEFORGE_HOST` set explicitly (default is `127.0.0.1`);
2. HTTPS in front of the API;
3. `GUIDEFORGE_OWNER_ID` set (only that identity can open a session);
4. `CORS_ORIGIN` set to the exact app origin(s);
5. session cookies remain HttpOnly + SameSite=lax.

## How the web app decides

`generateGatewayProposals` tries the server first; if unreachable or
unauthenticated it falls back to the deterministic local gateway. The returned
`receipt.provider` (`deepseek` vs `fake`) is stored with each proposal and
shown in the UI, so the user always knows which path produced it.
