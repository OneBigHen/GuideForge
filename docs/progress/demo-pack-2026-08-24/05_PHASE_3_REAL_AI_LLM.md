# Phase 3 — Real AI / LLM End-to-End

**Outcome:** owner and demo AI paths use a real server-side provider, report what actually ran, fail honestly, and enforce strict budgets.

## Task 3.1 — define explicit AI operating modes

Introduce explicit configuration instead of deriving behavior from fetch success.

Recommended:

```text
GUIDEFORGE_AI_MODE=real|offline
GUIDEFORGE_MODEL_PROVIDER=openrouter
OPENROUTER_API_KEY=<secret>
OPENROUTER_MODEL=<allowlisted model>
```

Web UI should know only capability state, never secrets.

Capability response example:

```json
{
  "mode": "real",
  "provider": "openrouter",
  "model": "server-selected",
  "available": true
}
```

Never send the provider API key or encrypted secret value.

## Task 3.2 — stop silent fake fallback in real mode

Current `apps/web/src/services/aiProposals.ts` falls back to `FakeModelAdapter` if the server path fails.

Change semantics:

```ts
generateGatewayProposals(snapshot, { mode: 'real' })
```

- `real`: a 401/403/429/5xx/provider/schema failure is visible to user and does not become fake.
- `offline`: use deterministic fake/rules adapter and visibly label it.
- optional `auto` is acceptable only for development and must expose which path was selected.

Add a visible result receipt:

```text
AI: OpenRouter · <model> · real
Input: N tokens · Output: N tokens · Cost: $X · Request: <short id>
```

Do not present provider billing metadata as precise if the adapter cannot prove it.

## Task 3.3 — wire OpenRouter through Cloudflare AI Gateway

Use the existing `OpenRouterAdapter` server-side.

Production base URL should be server-configured to the Cloudflare AI Gateway OpenRouter endpoint, not client-provided.

Add environment contract:

```text
CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID=
CLOUDFLARE_AI_GATEWAY_ID=guideforge
OPENROUTER_API_KEY=
```

Do not expose those values to the browser.

Set AI Gateway request logging to metadata-only / payload collection disabled so prompt/response bodies are not retained by default.

## Task 3.4 — owner AI proposal test

Using a seeded owner copy of the demo:

1. authenticate as owner;
2. edit one step so AI has meaningful text;
3. click AI proposal generation;
4. verify provider is OpenRouter via server receipt;
5. receive structured warning/tool/verification proposal;
6. reject one proposal;
7. accept one proposal;
8. verify only accepted command mutates guide;
9. verify audit/receipt entry exists.

No fake adapter is accepted for this test.

## Task 3.5 — source synthesis test

Use a small synthetic source.

Verify:

- source hash exists;
- regions/citations survive;
- actual provider route used;
- output conforms to schema;
- configured token/cost ceiling enforced;
- budget overflow fails closed;
- receipt includes model/tokens/cost/request id.

## Task 3.6 — production budget defaults

Initial public-demo ceilings should be intentionally small.

Suggested **starting** values, to tune after observing legitimate traffic:

```text
anonymous AI proposals:
  max 3 calls / 10 min per client/IP
  max 10 calls / 24h per demo browser identity
  max input ~3,000 tokens
  max output ~800 tokens
  max cost <= $0.02/request

owner proposal:
  max 10 calls/minute
  normal provider/model controls

owner synthesis:
  existing richer limits allowed
  still enforce per-call and daily budget

global public-demo:
  AI_PUBLIC_DEMO_ENABLED=true|false
  initial global spend ceiling: $2/day
```

These are operational starting points, not magical security constants. The important requirement is layered enforcement and a global kill switch.

## Task 3.7 — model allowlist

Public clients must never provide arbitrary model IDs.

Server configuration owns:

```ts
const PUBLIC_DEMO_MODELS = new Set([
  '<one inexpensive structured-output-capable model>',
]);
```

Owner model selection may be broader but still server allowlisted.

## Task 3.8 — AI health

Add an owner-visible health panel that distinguishes:

- API reachable;
- owner authenticated;
- provider configured;
- AI Gateway reachable;
- model request succeeds;
- last request status;
- current public-demo enabled/disabled;
- budget state.

Do not perform paid health probes on every page load. Cache a safe readiness signal or use an explicit test button.

**Phase gate:** a real provider call succeeds from production plumbing, fake fallback cannot masquerade as real, and token/cost metadata is visible.
