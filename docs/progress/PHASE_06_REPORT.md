# Phase 06 Report — Docling and AI Proposal Pipeline

## Outcome

The deterministic document-intake → extraction → review pipeline is
implemented and tested: intake validation with immutable SHA-256 hashing,
stable source-region IDs, structural chunking, strict extraction JSON
Schemas, a provider-independent ModelGateway (deterministic fake adapter +
OpenRouter + direct/local seams), citation gating (uncited actionable output
is rejected), confidence computation, usage receipts, and prompt-injection
fixtures. The web app's proposal generator now runs through the gateway and
produces cited, human-reviewable proposals.

## Commits

- `(this commit)` feat: Phase 06 Docling and AI proposal pipeline

## Delivered vertical slices

1. **packages/ai-contracts**: `SourceDocument`/intake policy,
   `SourceRegion` + `stableRegionId` (deterministic FNV-1a), `structuralChunking`,
   strict `ExtractionOutput` schema + validator, `Citation` +
   `validateCitations` gate, `computeConfidence` (weighted, never model
   self-confidence), `AiProposal`, `UsageReceipt`.
2. **packages/model-gateway**: `ModelGateway` with ordered adapter fallback and
   ZDR routing; `FakeModelAdapter` (deterministic rules, privacy-safe),
   `OpenRouterAdapter` (strict JSON-Schema `response_format`; only when an
   API key is configured server-side — never in browser bundles),
   `DirectModelAdapter` seam; usage receipts per call.
3. **apps/worker-documents**: `ingest` (type/size/pages/encryption/malware),
   immutable `hashBytes`, `runExtractionPipeline` (chunk → regions →
   gateway), pinned `DOCLING_CONFIG` (`ds4sd/docling:2.37.0`, tesseract OCR,
   standard pipeline) as the conversion boundary.
4. **apps/web aiProposals**: `generateGatewayProposals` builds chunks from the
   guide snapshot, runs the gateway (ZDR policy → fake adapter), and creates
   proposals for suggested warnings, tools, and verification steps — all
   reviewable via the existing proposals panel.
5. **Injection fixtures**: hostile "command-like" outputs and malicious
   excerpts fail safely (strict schema rejects non-extraction shapes; citation
   gate rejects uncited claims).

## Acceptance evidence

| Gate | Evidence |
|---|---|
| Repeated source/config creates stable region IDs | `stableRegionId` deterministic + property test |
| Uncited actionable output is rejected | gateway test + `validateCitations` tests |
| AI cannot mutate a guide before acceptance | proposals only applied via `acceptProposal` command path (Phase 03) |
| Privacy policy never relaxes automatically | ZDR routing test forces privacy-safe adapter |
| Cost receipts and routing attempts recorded | `UsageReceipt` in every gateway response; unit tested |
| Injection fixtures fail safely | `injection.test.ts`: command-shape outputs rejected, malicious excerpts only cited as sources |

## Test results

- `pnpm check`: 80/80 tasks pass.
- ai-contracts: 16 tests (intake, region IDs, chunking, citation gate,
  confidence, extraction schema, injection).
- model-gateway: 5 tests (fake extraction, uncited rejection, ZDR routing,
  OpenRouter-unavailable, direct fallback).
- worker-documents: 5 tests (intake accept/reject, pipeline, stable regions).
- web: proposals tests pass; Playwright 22 passed / 2 skipped (WebKit offline).

## Responsive/device evidence

- Proposal review UI unchanged (Phase 03) and verified on desktop/iPad/iPhone.

## Accessibility evidence

- Proposal cards unchanged (Phase 03 accessibility foundations).

## Security and privacy impact

- No model API keys in browser bundles; OpenRouter key only server-side env.
- ZDR routing prefers the privacy-safe deterministic adapter; policy never
  relaxes automatically.
- Source documents are untrusted; extraction output must pass strict schema +
  citation gate before any proposal is created.
- Usage receipts include cost/latency/tokens but no document content.

## Persisted schema and migration impact

- No new persisted schema in this phase; proposals continue to use the Dexie
  `proposals` table (now with `sourceHash` populated).

## Context7/ADR updates

- ADR 0006 (AI proposal pipeline) added.

## Known limitations

- **Docling worker not runnable in this sandbox**: the pinned
  `ds4sd/docling:2.37.0` image could not be pulled (registry access denied)
  and pip DNS is unavailable, so the real converter could not be exercised.
  The deterministic fake converter covers the pipeline contract; running the
  real worker requires a host with registry access (`docker pull ds4sd/docling:2.37.0`).
- OpenRouter adapter is wired but untested against a live endpoint (no key in
  sandbox); strict-schema enforcement is enforced in code and unit-testable
  with a mock.

## Blocked external dependencies

- Docling container pull (registry denied in sandbox) — smallest action to
  resume: run on a host with registry access.
- Live OpenRouter key for real-model validation.

## Next phase readiness

- READY. Phase 07 (signed releases, Microsoft interop, native desktop) builds
  on the verified release/signing and interop foundations.

**Gate:** PASS
