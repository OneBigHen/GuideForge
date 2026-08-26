# Phase 6 — Abuse, Cost, and Observability

**Outcome:** a bot cannot quietly convert the demo into an unlimited OpenRouter credit burner.

## Layer 1 — Cloudflare WAF/rate limiting

Create targeted rules, not one blunt site-wide rate limit.

Priority endpoints:

```text
POST /api/demo/ai-proposals
owner login/auth endpoints
owner recovery/pairing endpoints
upload/import endpoints
```

Suggested initial public demo behavior:

- normal static browsing: no aggressive challenge;
- AI endpoint: low request rate per IP/session;
- repeated violations: Managed Challenge then block;
- obvious bot patterns: challenge/block;
- login failures: tighter failed-attempt policy.

Tune based on Security Analytics.

## Layer 2 — Turnstile

Require it for anonymous LLM calls.

Do not require it for simply viewing the demo unless bot traffic proves necessary.

Server-side Siteverify is mandatory.

## Layer 3 — application quota

Enforce even if the request passed Cloudflare:

- per demo browser identity;
- per IP/rate key;
- per rolling window;
- per day;
- bounded concurrency;
- timeout/cancellation;
- fixed max input/output;
- no arbitrary model.

Return `429` with a clear retry/quota message.

## Layer 4 — AI Gateway

Route OpenRouter through Cloudflare AI Gateway.

Configure:

- spend limits;
- rate limits as available;
- user/client metadata;
- provider/model analytics;
- payload logging disabled;
- anomaly review.

Use at least:

```text
global public-demo spend rule
per-public-client spend rule if metadata supports it
model-specific rule
```

## Layer 5 — provider cap

Configure OpenRouter/provider account caps/credit controls independently.

The app and edge should not be the only financial control.

## Layer 6 — app kill switch

Required environment/config:

```text
AI_PUBLIC_DEMO_ENABLED=false
```

The owner can disable public AI without taking the whole site offline.

Also support:

```text
AI_PUBLIC_DAILY_BUDGET_USD
AI_PUBLIC_MAX_COST_PER_REQUEST_USD
AI_PUBLIC_MAX_INPUT_TOKENS
AI_PUBLIC_MAX_OUTPUT_TOKENS
```

Server defaults must fail conservative if values are missing.

## Observability

Record metadata, not prompt bodies by default.

Per AI request:

```text
timestamp
request ID
route class (owner/public-demo)
hashed/categorical client identity
provider
model
input/output/cache tokens
reported cost
latency
result status
Turnstile result class
quota decision
HTTP status
```

Do not log:

- OpenRouter key;
- session cookie;
- Companion encrypted secret ciphertext unless necessary;
- recovery codes;
- signing private key;
- raw prompt/source text by default.

## Dashboards/alerts

Minimum operational views:

- AI calls/hour;
- AI cost/day;
- 429s;
- 401/403s;
- Turnstile failures;
- provider 5xx;
- latency p50/p95;
- origin 5xx;
- demo launches;
- owner logins;
- last successful backup.

Alerts:

- public AI daily spend > 50%, 80%, 100% of cap;
- burst of 429 or failed Turnstile;
- provider error rate spike;
- origin unavailable;
- unauthorized owner-path attempts spike.

## Fail2ban scope

Optional:

- SSH brute-force;
- direct host-auth services not protected at Cloudflare;
- origin logs only if the real client IP chain is trusted and unambiguous.

Do **not** build the public web defense around fail2ban.

## Incident runbook

If cost/abuse spikes:

1. set `AI_PUBLIC_DEMO_ENABLED=false`;
2. apply/block WAF rule;
3. lower/zero AI Gateway spend limit;
4. rotate provider key if leakage suspected;
5. revoke owner sessions if auth incident;
6. inspect metadata logs, not sensitive prompt dumps;
7. restore public AI only after root cause and new limit are verified.

**Phase gate:** automated tests prove missing Turnstile, exceeded quota, exceeded budget, and disabled kill switch all prevent provider invocation.
