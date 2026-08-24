# GuideForge Agent Instructions

These instructions apply to every coding task in this repository.

## Product authority

`docs/UNIVERSAL_BUILD_SPEC.md` is authoritative. Architecture decision records may refine it but cannot silently contradict its non-negotiable rules.

For the single-user AI studio program, `AGENTS_SINGLE_USER.md` is the repository operating policy (per `GuideForge_Single_User_AI_Build_Pack/prompts/MASTER_EXECUTION_PROMPT.md`). Its no-corner-cutting rules take precedence over convenience; original phase reports are evidence of intent, not proof of completeness.

## Non-negotiable architecture

- `apps/web` is the complete canonical product.
- `apps/desktop` is a thin Tauri 2 wrapper around `apps/web`.
- Do not build a separate desktop React editor.
- iPad is a first-class authoring target.
- iPhone is execution/review-first, with focused editing and explicit advanced 3D mode.
- Use capability detection, not device-name assumptions, wherever feasible.
- Guide content is local-first and collaborative through Yjs.
- Binary assets do not live inside Yjs.
- Published releases are immutable and signed.
- AI produces reviewable proposals, never direct silent guide mutations.
- Microsoft `.guide` is an external interoperability format, not canonical storage.
- The existing Guides Studio repository is read-only reference code.

## Documentation discipline

Before adopting or changing a framework, package, storage API, Tauri capability, OpenRouter feature, or database behavior:

1. Resolve current official documentation with Context7.
2. Record the exact package version selected.
3. Add or update an ADR when the choice affects architecture, persisted data, security, or portability.
4. Add tests that prove the required behavior.

Never rely on a remembered API when current documentation is available.

## Coding rules

- TypeScript strict mode is mandatory.
- Persisted structures require checked-in JSON Schema.
- Domain packages cannot import React, Three.js, browser APIs, database clients, or provider SDKs.
- Commands are the only supported guide mutation mechanism.
- Every command has a stable ID, actor, origin, timestamp, and typed payload.
- Use pure functions for migrations.
- No `any` in domain, commands, schema, package, auth, or model-gateway code.
- Avoid hidden global state.
- No placeholder buttons, fake toggles, dead routes, or unimplemented menu items.
- Errors must be visible and actionable.
- All destructive operations need a safe undo, recycle state, or explicit confirmation appropriate to impact.
- All long operations need progress and cancellation when technically possible.
- Build mobile layouts intentionally; never merely shrink desktop panels.

## Security rules

- Never place secrets in `VITE_*`, browser storage, committed files, screenshots, fixtures, or logs.
- Model provider keys remain server-side or in native secure storage.
- Privacy routing may become stricter automatically but may never relax automatically.
- Treat PDFs, archives, SVG, HTML, models, and imported metadata as untrusted.
- Prevent archive traversal, duplicate paths, expansion bombs, active-content injection, and unsafe external references.
- AI ingestion receives no shell, browser, network-fetch, or direct-write tools.
- Cookie-authenticated writes require CSRF protection.
- OIDC uses authorization code plus PKCE and exact redirect allow-lists.
- Tenant authorization is checked in application logic; PostgreSQL RLS is defense in depth.
- Do not put document text, prompts, source excerpts, names, tokens, filenames, or raw Yjs updates into ordinary telemetry.

## Quality gates

Every functional change must include:

- Unit or property tests for domain behavior.
- Integration tests for persistence/network boundaries.
- Responsive UI evidence for affected breakpoints.
- Accessibility checks for affected interactions.
- Migration impact assessment for persisted formats.
- Updated docs where user behavior or architecture changes.
- `pnpm check` passing.
- No newly introduced critical/high dependency findings.
- No skipped or weakened tests without a documented, time-bounded issue.

## Pull request shape

Keep each PR to one vertical slice:

- User-visible objective.
- Architecture impact.
- Files and packages changed.
- Tests and acceptance evidence.
- Security and privacy impact.
- Migration impact.
- Known limitations.
- Follow-up issue links.

## Stop conditions

Stop and clearly report only when work requires:

- Credentials that are not present.
- A legally restricted fixture or proprietary package.
- A physical-device check that cannot be emulated.
- A product decision with two materially incompatible, irreversible outcomes.
- A security issue that makes proceeding unsafe.

Otherwise make the safest reversible choice, record it, and continue.
