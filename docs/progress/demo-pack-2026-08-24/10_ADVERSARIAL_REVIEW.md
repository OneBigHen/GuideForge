# Adversarial Review — How This Demo Could Fool Us

Use this before accepting the implementation.

## 1. “The crypto bug is fixed”

False positive:

- developer tests only `localhost`;
- asset add works there;
- public/LAN behavior never checked.

Falsification:

- test clean browser at final HTTPS hostname;
- intentionally test LAN HTTP and confirm graceful secure-context message;
- verify `window.isSecureContext`.

## 2. “AI is working”

False positive:

- API fails;
- browser silently uses `FakeModelAdapter`;
- UI still says “AI generated.”

Falsification:

- intentionally break OpenRouter key in `real` mode;
- UI must show real provider unavailable and must not produce fake proposals;
- restore key; capture a real provider receipt.

## 3. “Only I can author”

False positive:

- owner identity is just a UUID in request body;
- someone who knows it can mint a session.

Falsification:

- unauthenticated caller with correct owner UUID must still fail unless it presents real credential/Access identity;
- treat UUID as public identifier.

## 4. “Cloudflare protects it”

False positive:

- WAF exists, but origin/backend ports are directly reachable;
- attacker bypasses Cloudflare.

Falsification:

- from an external network, scan/test expected backend ports;
- only intended public HTTPS origin is reachable.

## 5. “Turnstile is installed”

False positive:

- widget renders;
- backend never validates token.

Falsification:

- POST without token -> no provider call;
- fake token -> no provider call;
- replay valid token -> no provider call.

## 6. “Rate limiting protects cost”

False positive:

- in-memory limiter resets on restart;
- many IPs still drain global budget.

Falsification:

- restart app between calls;
- global spend rule must remain authoritative;
- test kill switch and AI Gateway/provider cap.

## 7. “Anonymous users cannot change owner data”

False positive:

- UI hides edit links;
- public client can call mutation endpoint directly.

Falsification:

- use curl/browser fetch to every owner mutation route without auth;
- expect 401/403 before DB mutation.

## 8. “Demo is useful on a fresh machine”

False positive:

- developer's IndexedDB already contains guides/assets.

Falsification:

- clean browser profile/context;
- no local storage;
- demo still installs and launches.

## 9. “Demo content is harmless”

False positive:

- “Get to Know Andrew” contains real personal details scraped from private content.

Falsification:

- inspect fixture;
- use synthetic/explicitly approved content only;
- no private addresses, credentials, medical, HR, or other personal data.

## 10. “Logs are safe”

False positive:

- AI Gateway/app logs store full prompt/source payload.

Falsification:

- inspect gateway log settings and sample logs;
- payload body collection disabled by default;
- secrets never present.

## 11. “Companion is safely behind Docker”

False positive:

- transport guard was disabled to make reverse proxy work;
- service now listens plaintext broadly.

Falsification:

- inspect bind addresses;
- verify trusted-proxy/internal TLS design;
- external request cannot reach Companion directly.

## 12. “The demo proves the product”

False positive:

- sample is a hard-coded static page unrelated to real GuideForge schemas/runtime.

Falsification:

- fixture validates with normal guide schema;
- uses normal storage;
- uses normal run/training flows;
- uses normal asset service;
- AI proposals use normal command/proposal semantics where safe.

## Final adversarial verdict standard

Launch is acceptable only if the demo is both:

1. **authentic** — exercises the real architecture; and
2. **bounded** — no anonymous path inherits owner privilege or open-ended spend.
