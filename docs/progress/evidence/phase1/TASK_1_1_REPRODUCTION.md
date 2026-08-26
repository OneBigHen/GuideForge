# Phase 1 Task 1.1 — Reproduction Evidence (before any code change)

Date: 2026-08-25
Repo: GuideForge @ `73fb55e` (main basis), branch `feat/public-demo`
Browser: HeadlessChrome/149.0.0.0 (Linux x86_64), 1280x577
Screenshot: `docs/progress/evidence/phase1/repro-lan-http-assets.png`

## Origin comparison

| Origin                     | isSecureContext | typeof crypto | typeof crypto.subtle | typeof crypto.randomUUID | OPFS (`navigator.storage.getDirectory`) |
| -------------------------- | --------------- | ------------- | -------------------- | ------------------------ | --------------------------------------- |
| `http://192.168.1.40:1420` | **false**       | object        | **undefined**        | **undefined**            | **false**                               |
| `http://localhost:1420`    | true            | object        | object               | function                 | true                                    |

## Failure mode 1 — UI click path (LAN HTTP)

Action: `/assets` → click procedural template button `simple-pipette`.

Result: opaque toast rendered by the app:

```text
Cannot read properties of undefined (reading 'digest')
```

No actionable explanation; page does not crash but the operation silently fails with a cryptic message.

## Failure mode 2 — service layer ordering

`OpfsAssetStore.put()` (packages/storage-web/src/index.ts:482) calls `sha256Hex(bytes)`
(packages/storage-web/src/index.ts:377) **before** any storage write, so on an insecure origin the
asset pipeline always dies first at:

```text
TypeError: Cannot read properties of undefined (reading 'digest')   // crypto.subtle is undefined
```

A secondary probe constructing `AssetLibrary` with no constructor arguments additionally showed the
OPFS branch is unreachable on this origin (`navigator.storage.getDirectory` is also secure-context
only), confirming both storage primitives are denied together.

## Direct primitive probes (LAN HTTP)

```text
crypto.subtle.digest(...)  -> TypeError: Cannot read properties of undefined (reading 'digest')
crypto.randomUUID()        -> TypeError: globalThis.crypto.randomUUID is not a function
```

## Conclusion

Proven (not "probably"): on plain-LAN HTTP, the browser denies secure-context-only APIs.
`SubtleCrypto` and `crypto.randomUUID` are absent entirely (`typeof === 'undefined'`), and OPFS
(`navigator.storage.getDirectory`) is also missing. The asset pipeline hits both:
hashing via `crypto.subtle.digest('SHA-256', ...)` in `packages/storage-web`, and OPFS writes in
`OpfsAssetStore`. The current code produces two different opaque TypeErrors depending on which
missing API is hit first, neither of which explains the HTTPS requirement to the user.

The final public origin `https://guides.henning.rodeo` will be a secure context; localhost already is.
