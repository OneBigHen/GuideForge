# Phase 2 — Demo Guide and First-Run Experience

**Outcome:** a fresh visitor can immediately see what GuideForge can do.

## Demo content decision

Preferred title:

```text
Get to Know Andrew (Demo)
```

Before creating it, search one final time for a legitimate existing guide/export on the host/repo. If a real fixture exists and is intentionally shareable, use it.

If not, create a synthetic fixture. Never fabricate private facts about a real Andrew.

Suggested fictional framing:

> Andrew is a fictional team member used to demonstrate onboarding-style GuideForge content.

## Required demo coverage

The demo must exercise product primitives, not just show text.

### Guide
- title + short description;
- 3 tasks;
- 2–4 steps per task;
- at least one warning;
- at least one required tool;
- one verification step;
- one completion rule;
- a clear “finish” state.

Example tasks:

1. **Meet Andrew**
   - role/working style as fictional demo content;
   - communication preference;
   - what the learner will know by end.

2. **Set up Andrew's workbench**
   - attach procedural workbench asset;
   - attach one instrument such as pipette or beaker;
   - include a warning/verification to demonstrate structure.

3. **Knowledge check**
   - one learning objective;
   - 2–3 assessment items;
   - feedback/rationale;
   - a passing threshold.

### Sources/citations
Include one synthetic bundled source, e.g. `demo/andrew-profile.md`, with explicit demo provenance.

AI-generated content must cite source regions where the existing system supports it.

### Assets
Use deterministic procedural assets from `SEED_CATALOG`.

### Runtime
The public visitor must be able to start the guide, complete steps, and finish using only browser-local state.

### Training
The public visitor must be able to enter the training player, answer items, submit, and see result/remediation.

## Fixture format

Do not seed the demo by calling a dozen UI buttons at runtime.

Create a versioned deterministic fixture in a location consistent with repo conventions, for example:

```text
apps/web/src/demo/get-to-know-andrew.ts
apps/web/src/demo/get-to-know-andrew.test.ts
```

or a validated `.gforge` fixture if that makes round-trip fidelity stronger.

Expose:

```ts
export const DEMO_GUIDE_VERSION = 1;

export async function ensureDemoGuide(): Promise<{
  guideId: string;
  created: boolean;
  version: number;
}>;
```

Requirements:

- idempotent;
- never overwrites a visitor's modified local demo copy without an explicit reset;
- upgrades can create a new version;
- demo state is clearly marked separately from owner guides;
- demo data can be reset locally.

## Public demo route

Add `/demo` as the stable public entry point.

Recommended first screen:

- headline: what GuideForge does;
- `Launch demo` primary action;
- three proof points: guided procedures, cited AI, interactive 3D/assets;
- “Real AI available” status only if real provider health is green;
- no admin/settings controls.

On launch:

1. ensure seed assets;
2. ensure demo guide;
3. navigate to a demo-safe run/overview route.

## Library behavior for owner

On the owner `/library` screen, when there are zero canonical guides:

- offer `Install demo guide`;
- do not silently mix anonymous demo data into owner canonical data;
- optionally allow owner to explicitly copy/import the demo as a normal guide.

## Tests

Unit:

- fixture validates against current guide schema;
- seed is deterministic;
- second seed does not duplicate;
- local modifications survive page reload;
- reset recreates pristine demo.

Browser:

- fresh context -> `/demo` -> launch -> guide visible;
- asset references resolve;
- run completes;
- training completes;
- refresh works offline after first load if PWA scope supports it;
- visitor cannot navigate from demo into owner library without owner gate.

**Phase gate:** a person who knows nothing about GuideForge can understand the product within two minutes without creating content first.
