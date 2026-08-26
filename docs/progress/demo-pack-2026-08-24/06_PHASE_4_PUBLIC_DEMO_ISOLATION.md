# Phase 4 — Public Demo Isolation

**Outcome:** strangers can try the product without receiving owner privileges or a path to unlimited LLM spend.

## Task 4.1 — create a dedicated anonymous AI route

Do not expose the full owner `/api/guides/:guideId/*` surface anonymously.

Create a purpose-built endpoint such as:

```text
POST /api/demo/ai-proposals
```

Request shape:

```ts
interface PublicDemoAiRequest {
  turnstileToken: string;
  demoVersion: number;
  steps: Array<{
    stepId: string;
    instructionText: string;
  }>;
}
```

Reject:

- unknown demoVersion;
- > 12 steps;
- > 1,500 characters per step;
- > configured total payload;
- non-string IDs/text;
- URLs if not necessary;
- model/provider/system prompt fields;
- file content;
- arbitrary source fetch instructions.

Response:

```ts
interface PublicDemoAiResponse {
  proposals: PublicProposal[];
  citations: PublicCitation[];
  receipt: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    providerCostUsd: number;
    requestId: string;
  };
  quota: {
    remainingWindow: number;
  };
}
```

No server-side guide mutation.

## Task 4.2 — Turnstile validation

The browser widget is only the first half.

The API must call Cloudflare Turnstile Siteverify server-side before consuming LLM budget.

Requirements:

- verify success;
- verify expected hostname/action where configured;
- reject expired token;
- reject already-used token;
- timeout Siteverify safely;
- do not call OpenRouter if validation fails.

Automated test uses Turnstile test keys/mocked verifier; production smoke uses real widget.

## Task 4.3 — anonymous browser identity

Use a random local demo identifier for quota correlation, not as authentication.

Properties:

- generated once in local browser;
- non-secret;
- rotated/resettable;
- supplied as custom metadata to AI Gateway if useful;
- combined with edge/IP rate limiting;
- never grants owner access.

## Task 4.4 — quota store

Do not rely solely on process-memory maps for public spend.

Use one of:

- a small persistent server table;
- SQLite/Redis/KV already present in the deployment;
- Cloudflare enforcement as authoritative plus local counters for UX.

Track at minimum:

```text
client identifier hash
coarse IP/rate key where allowed
window start
calls
estimated/actual cost
last request
```

Avoid storing full prompts for quota purposes.

## Task 4.5 — local proposal application

Anonymous AI results may update only the browser-local demo copy after explicit user acceptance.

They must never call owner canonical mutation endpoints.

## Task 4.6 — public navigation boundary

Public demo must not leak hidden admin buttons.

But do not rely on hiding buttons for security: direct requests to owner paths/endpoints still must fail unless owner-authorized.

Browser tests:

- anonymous `/demo` succeeds;
- anonymous `/library` is blocked/redirected by owner gate;
- anonymous `/settings` blocked;
- anonymous `/api/guides/*` 401/403;
- anonymous `/api/demo/ai-proposals` without Turnstile rejected;
- valid demo AI call succeeds;
- repeated calls hit quota;
- demo AI cannot mutate owner guide.

**Phase gate:** anonymous users have an impressive path, but no canonical write path.
