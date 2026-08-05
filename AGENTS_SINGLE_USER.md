# GuideForge Single-User Agent Rules

These rules apply to the entire execution program.

## Mission

Turn the current GuideForge repository into a complete, trustworthy, single-user, web-first spatial procedure and training studio.

The product must work, not merely appear complete in documentation.

## Non-negotiable product rules

- `apps/web` remains the canonical user interface.
- iPad is a first-class authoring device.
- iPhone is a first-class training, execution, capture, review, and focused-edit device.
- Tauri remains a thin capability wrapper, not a separate frontend.
- The primary product is single-user. Remove fake organization, workspace, membership, and role theater from primary paths.
- A complete guide includes procedure content, training content, spatial state, assets, sources, citations, assessments, execution records, and package metadata.
- Scene state cannot remain authoritative in a separate Dexie database.
- Binary assets never live inside Yjs.
- Every mutation uses a typed command.
- Every AI output is a proposal until explicitly accepted.
- Every source-derived actionable claim has at least one valid citation.
- Every assessment answer and rationale is source-grounded or explicitly author-created.
- AI cannot approve, sign, release, or mark training as mastered.
- Language models describe semantic intent. Deterministic code calculates final transforms, arrow geometry, scoring, and state transitions.
- `.gforge` is the complete portable format.
- Generated equipment is a visual approximation unless reviewed and dimension-checked.

## No-corner-cutting rules

Never claim a phase is complete by doing any of the following:

- adding only interfaces, types, or documentation;
- leaving primary paths on fake adapters;
- creating buttons that do not complete their action;
- returning empty arrays as success;
- silently catching an error and using a fake result;
- skipping tests because credentials are missing without testing the no-credential path;
- using an emulated iPad test as evidence of Apple Pencil or real Safari behavior;
- using a padded short hash where SHA-256 is required;
- storing signing secrets in `localStorage`;
- passing an empty asset map during package export;
- storing authoritative scene data separately from the guide;
- allowing unbounded synchronous archive extraction;
- letting the model invent raw final XYZ positions;
- allowing a model to generate answer keys without deterministic validation;
- marking a generated model as exact equipment;
- leaving `TODO`, placeholder, demo-only, mock, fake, or not-implemented behavior in a phase's required path;
- weakening a failing test to pass the gate;
- hiding dependency, license, security, accessibility, or cost failures with `|| true`.

## Current documentation requirement

Before changing a framework, provider API, persisted format, browser storage behavior, Tauri permission, learning standard, or 3D model integration:

1. query current official documentation through Context7 or the original primary source;
2. pin the exact version;
3. record the decision in an ADR;
4. add an integration or conformance test.

Do not trust remembered APIs.

## Single-user modes

GuideForge supports these honest modes:

### Browser-only offline mode

- no server required;
- local drafts;
- local assets;
- manual imports;
- deterministic authoring and playback;
- no provider secrets in the browser.

### Companion mode

A local or self-hosted companion provides:

- DeepSeek proxy;
- Docling;
- audio/video processing;
- local 3D generation;
- Blender/FreeCAD processing;
- provider searches requiring server mediation;
- optional synchronization and remote device access.

### Network owner mode

When the companion is exposed beyond loopback:

- HTTPS is required;
- one owner identity is required;
- secure HttpOnly sessions are required;
- CSRF, origin checks, rate limits, and recovery controls are required;
- body-supplied roles are prohibited.

## DeepSeek operating rules

- Default to the lowest-cost model profile that passes quality gates.
- Use configuration profiles, not provider model names scattered through source.
- Keep stable system prompts and schemas at the beginning of requests to maximize prefix caching.
- JSON mode guarantees valid JSON, not schema correctness. Validate with the checked-in runtime schema.
- Use one bounded repair attempt for invalid output.
- Use thinking mode only for tasks whose evaluation shows a material benefit.
- Use tool calls only through narrow typed tools.
- Never provide unrestricted shell, filesystem, browser, network, publication, or guide-write tools.
- Record model, tokens, cache tokens, latency, cost, prompt version, schema version, source hash, and request ID.
- Enforce per-job call and dollar budgets.

## Repository discipline

- TypeScript strict mode.
- No `any` in domain, schema, command, package, security, AI, training, or spatial-planning packages.
- Persisted contracts require JSON Schema and migrations.
- Domain packages cannot import React, Three.js, Yjs, Dexie, provider SDKs, Tauri, Fastify, or databases.
- Runtime adapters cannot redefine domain structures.
- No secrets in `VITE_*`, browser storage, logs, screenshots, fixtures, or commits.
- No generated artifacts, model weights, user photos, source documents, or private guide packages in Git.

## Testing discipline

Every phase must add the tests that prove its claims:

- unit;
- property;
- integration;
- browser E2E;
- migration;
- package round trip;
- security/adversarial;
- accessibility;
- performance;
- real-device runbook where automation cannot prove behavior.

A phase report must list exact commands and results.

## Stop conditions

Stop only when:

- a required credential is unavailable;
- a legally usable fixture is unavailable;
- physical hardware is necessary for the next uncompleted gate;
- two irreversible product choices conflict;
- continuing would expose secrets or create an unsafe deployment.

Complete all independent work before reporting the blocker.
