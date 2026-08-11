# Phase 01 Report — Production Companion and Owner Security

Date: 2026-08-11
Authority: `GuideForge_Production_Readiness_Pack_abefa747`
Baseline audited: `abefa7475d52931957721b571df828c364c7e924`

## Status

The Phase 01 implementation commit
`b6ec6b8e5c3d99e796845d2a336e7e77a6e1d8b7` is verified locally and by GitHub
run `31498373276`: the required `check` job and Playwright desktop/iPad/iPhone
job both passed. The follow-up documentation commit does not change the
implementation under test.

The physical iPad/iPhone path is not executed in this environment. The
network gate is covered by a real HTTPS listener and a separate HTTPS client,
and the responsive settings path is exercised in an iPhone 13 emulation.

## Delivered path

- Added `apps/companion`, a loopback-default Fastify service with SQLite
  migrations and no organization/workspace/RBAC dependency in its primary
  owner path.
- Added first-run owner setup, Argon2id password and recovery hashes, opaque
  rotating session cookies, logout/revoke/recovery, exact Origin allowlisting,
  request/body/login limits, and a WebAuthn seam.
- Required TLS for non-loopback hosts; the entrypoint also rejects permissive
  private-key file modes. SQLite and generated key material are restricted to
  the owner (`0600` files, `0700` data directory).
- Added AES-256-GCM provider/signing secret storage. Settings APIs expose only
  metadata; secret values never return to the browser.
- Added one-time device pairing and the web `/settings` setup, sign-in,
  pairing, secret, and sign-out UX. The web build must use a same-site
  `VITE_COMPANION_URL` (for example `http://localhost:4317`) because the
  session cookie is `SameSite=Strict`.

## Acceptance evidence

| Requirement                             | Current evidence                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown owner and wrong password        | `apps/companion/src/server.test.ts`: dummy-hash unknown-owner path and invalid-password path return 401                                                                                                         |
| User ID alone cannot authenticate       | Login accepts only the password; the test supplies an ignored user ID and verifies the real owner password is required                                                                                          |
| Brute force                             | Per-IP login bucket returns 429 after the configured threshold                                                                                                                                                  |
| CSRF and bad Origin                     | Cookie-authenticated secret writes without Origin or with `https://evil.example` return 403; the configured Origin passes                                                                                       |
| Session rotation/revoke/recovery/expiry | Rotation invalidates the old cookie; logout/revoke-all/recovery invalidate sessions; expiry and revoked records fail closed                                                                                     |
| Loopback and LAN HTTPS                  | Loopback defaults to HTTP for local use; non-loopback config without TLS throws; generated-cert listener/client test authenticates over HTTPS and receives `Secure` cookie                                      |
| Capabilities                            | `/api/capabilities` reports Argon2id, opaque rotating cookies, SQLite, encrypted secrets, pairing, and the passkey seam                                                                                         |
| Secret boundary                         | Provider value is decrypted only inside the injected `SecretBox`; HTTP reads return configured metadata, never plaintext                                                                                        |
| Pairing                                 | Authenticated owner creates a one-time code; a second client consumes it once and reuse returns 401                                                                                                             |
| Settings UX                             | Playwright flow completes owner setup, sign-in, pairing on desktop and sign-in on iPhone 13 emulation; screenshots reviewed at `/tmp/guideforge-settings-desktop.png` and `/tmp/guideforge-settings-iphone.png` |

## Exact verification

| Command                                                        | Result                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm --filter @guideforge/companion test`                     | 10/10                                                                             |
| companion typecheck, lint, format, `git diff --check`          | pass                                                                              |
| `pnpm --filter @guideforge/web test`                           | 23/23                                                                             |
| web typecheck, lint, build                                     | pass                                                                              |
| rendered settings flow with real companion + Playwright        | desktop setup/login/pairing and iPhone 13 login pass; no console/request failures |
| `pnpm check --force`                                           | 120/120 tasks, 6m12.562s, fresh/no cache                                          |
| `pnpm security:audit`                                          | pass; reviewed esbuild SUPPLY-0001 remains documented                             |
| `pnpm security:licenses`                                       | pass                                                                              |
| `pnpm security:sbom`                                           | pass; CycloneDX 1.6 JSON generated to ignored `sbom.xml`                          |
| `pnpm security:secret-scan`                                    | pass (regex fallback; gitleaks unavailable locally)                               |
| `pnpm security:policy-test`, `pnpm boundary`, `pnpm dep-check` | pass                                                                              |

## Deliberate boundaries

- Passkeys are an explicit `501` WebAuthn seam, not a fake login path.
- Rate buckets are per-process; a shared limiter belongs with a later durable
  job/runtime phase.
- `apps/api` remains a compatibility BFF for existing proposal/review routes.
  The new companion owner authentication, pairing, and secret paths do not
  accept or depend on its legacy JWT/org/RBAC identity model.
- Physical Safari/iPad/iPhone hardware, certificate trust installation, and
  end-user LAN discovery remain unproven here.

## Next phase readiness

Phase 02 can proceed. No prior Phase 01 PASS claim is reused.
