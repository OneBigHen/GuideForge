# ADR 0027: Phase 15 Security and Reliability Boundaries

## Status

Accepted for the local release candidate; external scanner and provider gates
remain open.

## Decision

Keep provider URLs as deployment configuration and validate them at adapter
construction. Official OpenRouter and DeepSeek adapters use exact provider
host allowlists. The VLM adapter uses an explicit host allowlist for remote
deployments and an opt-in loopback seam for local inference. No provider URL
may carry credentials, query, or fragment data.

Keep content-addressed storage fail-closed on read as well as write/import.
Hash verification is cheap relative to returning corrupted source or asset
bytes and preserves the existing `null` missing-artifact recovery path.

Keep source bytes inert in the browser. HTML/SVG are retained as source
artifacts and route to a trusted companion converter; the browser does not
render uploaded source markup.

Keep service-worker activation and job transitions explicit. A pending worker
waits for owner action, and provider failure (including GPU OOM) is a durable
failed state that can be cancelled but is not falsely presented as resumable.

## Consequences

- Misconfigured remote provider endpoints fail before network I/O.
- Self-hosted VLM deployments must set `VLM_ALLOWED_HOSTS` unless they use
  loopback.
- Corrupted local bytes become recoverable missing artifacts instead of being
  silently consumed.
- DNS rebinding and egress policy remain deployment responsibilities; the
  application-level host check is not a substitute for network isolation.
- The local Phase 15 gate can be evidence-backed without claiming Strix,
  physical-device, or live-provider coverage that was not available.
