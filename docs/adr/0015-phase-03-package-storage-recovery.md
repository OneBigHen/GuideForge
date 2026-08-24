# ADR 0015 — Phase 03 package, storage, and recovery boundary

Status: accepted

## Decision

The canonical portable project format is `.gforge` v2. Draft exports contain
the canonical `GuideSnapshot`, referenced content-addressed assets, source
metadata, optional source bytes, and manifest-bound reports. Full backups use
the same layout with `packageType: "backup"` and may include runtime evidence
and runtime files. Evidence is never silently included in a draft export and
is rejected on import when the manifest does not opt into the backup policy.

Archive import uses central-directory preflight followed by bounded streaming
inflation. Package-relative paths, SHA-256 hashes, sizes, source inventories,
report inventories, and runtime policy are checked before persisted use.
Metadata rejects active HTML content and non-HTTP(S) external-resource fields.

The browser storage boundary remains local-first: OPFS is preferred for large
content-addressed assets, IndexedDB is the tested fallback, and Dexie versions
5–7 add source bytes, restore reports, and runtime blobs without rewriting
existing Yjs documents. Export fails closed if any referenced asset bytes are
missing. Restore records a migration/restore report alongside the imported
project.

Release-signing private keys remain in the companion process. The companion
stores encrypted Ed25519 private material behind its existing 0600 master-key
boundary, exposes public metadata and signing only to an authenticated owner,
and supports active-key rotation plus revocation that deletes private
material.

## Consequences

- A clean local profile can restore the project data exercised by the web
  backup test without relying on stale Dexie-only source rows.
- Hostile archives fail before application rendering or persistence, with both
  per-file and archive-wide expansion bounds.
- Browser UI can show storage health and request persistent storage; actual
  quota values remain browser-provided estimates.
- Native OS keychain/enclave integration, physical-device testing, and live
  provider-backed artifacts remain later release/device gates.
