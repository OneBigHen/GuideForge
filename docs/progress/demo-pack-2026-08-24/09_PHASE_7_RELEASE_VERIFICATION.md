# Phase 7 — Release Verification

**Outcome:** launch claims are backed by evidence from the real public path.

## Required local/CI commands

From repo root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm boundary
pnpm dep-check
pnpm security:policy-test
pnpm security:secret-scan
pnpm security:licenses
```

Run the repo's existing release verification scripts where appropriate:

```bash
pnpm release:policy
pnpm release:verify
```

Do not ignore a red job because a previous failure was environmental without reconfirming the exact failure.

## Public-path smoke suite

Run against:

```text
https://guides.henning.rodeo
```

Not only localhost.

### Anonymous
- home loads;
- `/demo` loads;
- demo seed works in clean browser context;
- seed assets render/list;
- no console errors;
- real AI demo requires Turnstile;
- one legitimate real AI call succeeds;
- provider/receipt shown as real;
- repeated calls rate limit;
- direct owner route blocked;
- direct owner API blocked.

### Owner
- Access/owner authentication succeeds;
- library opens;
- asset manager works;
- add procedural asset works;
- create/open guide works;
- real AI proposal works;
- accept/reject works;
- source synthesis works within budget;
- settings do not reveal secret values;
- sign/release path works if included in launch scope;
- logout/revoke works.

### Restart
Restart production services.

Then verify:

- public demo still loads;
- owner auth/owner state intact as designed;
- provider configuration still present securely;
- databases healthy;
- public budget/quota authority still protects provider;
- no duplicated seed records.

## Device/viewports

Automated:

- desktop Chromium;
- iPad-sized;
- iPhone-sized.

Physical, if available:

- iPhone Safari;
- iPad Safari.

Specific browser capability checks:

```js
window.isSecureContext === true
crypto.subtle is available
service worker scope valid
IndexedDB works
OPFS or IndexedDB fallback works
```

## Security negative tests

Must fail:

- malformed demo AI body;
- oversized demo AI body;
- missing Turnstile;
- reused/expired Turnstile;
- arbitrary model field;
- arbitrary provider URL;
- anonymous owner API;
- wrong Origin for cookie write;
- non-Secure production owner cookie;
- direct Companion secret endpoint anonymous;
- public AI disabled;
- public spend cap exceeded.

## Launch report

Create:

```text
docs/progress/PUBLIC_DEMO_LAUNCH_REPORT.md
```

Include:

- deployed commit SHA;
- public URL;
- CI run links;
- browser test evidence;
- exact real AI provider/model receipt sample with secrets redacted;
- rate-limit evidence;
- Turnstile rejection evidence;
- spend-limit/kill-switch evidence;
- open known risks;
- rollback command/path.

Do not write “production ready” if any critical gate is waived.

**Phase gate:** all critical rows in `12_ACCEPTANCE_MATRIX.md` are PASS with evidence.
