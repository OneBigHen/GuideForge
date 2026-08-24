[0m
> build · ox-alpha-free
[0m
[0m$ [0mgit status && git log --oneline origin/main..HEAD | head -60
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
On branch feat/single-user-ai-studio
Your branch is up to date with 'origin/feat/single-user-ai-studio'.

nothing to commit, working tree clean
90e6069 fix(deps): override nanoid to 3.3.18 (GHSA high, postcss transitive)
7830728 ci: install poppler-utils for PDF page-render fallback tests
f6d16a6 ci: use pnpm standalone install to fix self-installer EACCES
5bcc48e chore: fix prettier formatting, ignore local V2 build pack artifact
88a52fc docs: add PLAN_TONIGHT.md so Paperclip's workspace clone can read it
c80cb42 fix: close multimodal provider fallback seams
45f071f test: make provider fetch stubs lint-safe
5a4f9f9 feat: serialize photo GPU queue leases
ecc7fa7 feat: route semantic and vision AI through OpenRouter
e6b77f9 fix: preserve runtime document provider receipts
81c833b docs: record phase17 no-cut decision
0a6765d feat: certify phase16 golden workflows
5d8593f feat: close phase15 security reliability hardening
6836915 feat: close phase14 release operations
16e3efb feat: close phase13 device performance gates
159dd68 fix: close phase12 runtime contract review
09ee3b7 fix: harden phase12 runtime evidence
ae44f15 feat: add phase12 procedure runtime
8d9c67f fix: close phase11 spatial compiler review
9923231 feat: add phase11 spatial compiler
958ea99 feat: add phase10 surface attachments
70a8b5f feat: add phase09 photo to 3d queue
f1f20f3 feat: add phase08 asset safety and manager
68ca076 feat: add offline training runtime and standards adapters
fd9bace docs: record phase 06 training evidence
dbf992d feat: add source-grounded training studio
65f28dd feat: add explicit deepseek synthesis gateway
6fead73 feat: wire real phase04 multimodal providers
8f975db docs: record phase 03 stabilization evidence
64bc867 test: allow TLS integration test startup variance
58263c4 docs: certify phase 03 recovery evidence
3f70f67 feat: add production package recovery and storage
eb9ade1 docs: certify phase 02 evidence
2158d51 feat: make guide snapshot v4 canonical
178d1fc docs: certify phase 01 evidence
b6ec6b8 feat: add production companion owner security
6653ace docs: record phase 00 ci evidence
8b97360 ci: fetch history for gitleaks
8e7f22b ci: grant gitleaks pull request access
88e6716 ci: pass database url through turbo
01eea9b ci: use runner-owned pnpm store
8a05224 chore: certify current production baseline
abefa74 feat: add source-grounded procedure synthesis
4262877 feat: Phase 05 multimodal ingestion, source studio, receipts
25102ba feat: Phase 04 asset library, seed catalog, and providers
3507014 feat: Phase 03 complete spatial editor
753cda7 feat: Phase 02 canonical spatial guide + complete .gforge
328c70d feat: Phase 01 single-user repairs — owner session, SHA-256, validation, provenance, bounded unzip, unsigned releases
4a618e2 feat: Phase 00 truth baseline — CI E2E, policy gates, honest capability matrix
066ee0d chore: establish single-user AI studio execution baseline
[0m
[0m$ [0mgit diff --stat origin/main...HEAD | tail -40
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
 packages/spatial-compiler/src/index.ts             | 1291 ++++++
 packages/spatial-compiler/tsconfig.json            |    7 +
 packages/storage-web/package.json                  |    2 +
 .../schemas/AiProposalRecord.schema.json           |   74 +
 .../storage-web/schemas/EvidenceRecord.schema.json |  105 +
 .../schemas/PhotoTo3DJobRecord.schema.json         |   77 +
 .../schemas/RuntimeCompletionReport.schema.json    |  138 +
 .../schemas/RuntimeSessionRecord.schema.json       |  134 +
 .../schemas/TrainingSessionRecord.schema.json      |  104 +
 packages/storage-web/src/index.test.ts             |  172 +-
 packages/storage-web/src/index.ts                  |  323 +-
 packages/storage-web/src/schema-validation.ts      |   29 +
 packages/synthesis/package.json                    |   27 +
 packages/synthesis/src/extract.ts                  |  124 +
 packages/synthesis/src/gateway.test.ts             |  231 +
 packages/synthesis/src/gateway.ts                  |  463 ++
 packages/synthesis/src/index.test.ts               |  296 ++
 packages/synthesis/src/index.ts                    |   32 +
 packages/synthesis/src/synthesize.ts               |   75 +
 packages/synthesis/src/types.ts                    |  185 +
 packages/synthesis/src/validate.ts                 |  232 +
 packages/synthesis/tsconfig.json                   |    7 +
 pnpm-lock.yaml                                     | 1382 +++++-
 pnpm-workspace.yaml                                |   18 +
 release/tauri-matrix.json                          |   26 +
 release/version-policy.json                        |   11 +
 scripts/build-release-metadata.mjs                 |  156 +
 scripts/check-audit-policy.mjs                     |  103 +
 scripts/check-boundaries.mjs                       |   22 +-
 scripts/check-deps.mjs                             |   17 +-
 scripts/check-license-policy.mjs                   |   84 +
 scripts/check-release-policy.mjs                   |   84 +
 scripts/check-web-bundle.mjs                       |   48 +
 scripts/policy-scripts.test.mjs                    |  126 +
 scripts/release-lifecycle.mjs                      |  100 +
 scripts/release-recovery-drill.mjs                 |   56 +
 scripts/secret-scan.sh                             |   52 +
 scripts/verify-release-candidate.mjs               |   39 +
 turbo.json                                         |    1 +
 246 files changed, 40424 insertions(+), 1707 deletions(-)
[0m
[0m$ [0mgit diff --name-only origin/main...HEAD
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
.github/workflows/ci.yml
.gitignore
.npmrc
AGENTS.md
AGENTS_SINGLE_USER.md
PLAN_TONIGHT.md
apps/api/package.json
apps/api/src/index.test.ts
apps/api/src/index.ts
apps/api/src/server.ts
apps/collab/package.json
apps/companion/package.json
apps/companion/src/db.ts
apps/companion/src/index.ts
apps/companion/src/security.ts
apps/companion/src/server.test.ts
apps/companion/src/server.ts
apps/companion/tsconfig.json
apps/companion/tsconfig.release.json
apps/desktop/.prettierignore
apps/desktop/package.json
apps/desktop/src-tauri/Cargo.lock
apps/desktop/src-tauri/icons/128x128.png
apps/desktop/src-tauri/icons/128x128@2x.png
apps/desktop/src-tauri/icons/32x32.png
apps/desktop/src-tauri/icons/64x64.png
apps/desktop/src-tauri/icons/Square107x107Logo.png
apps/desktop/src-tauri/icons/Square142x142Logo.png
apps/desktop/src-tauri/icons/Square150x150Logo.png
apps/desktop/src-tauri/icons/Square284x284Logo.png
apps/desktop/src-tauri/icons/Square30x30Logo.png
apps/desktop/src-tauri/icons/Square310x310Logo.png
apps/desktop/src-tauri/icons/Square44x44Logo.png
apps/desktop/src-tauri/icons/Square71x71Logo.png
apps/desktop/src-tauri/icons/Square89x89Logo.png
apps/desktop/src-tauri/icons/StoreLogo.png
apps/desktop/src-tauri/icons/icon.icns
apps/desktop/src-tauri/icons/icon.ico
apps/desktop/src-tauri/icons/icon.png
apps/desktop/src-tauri/tauri.conf.json
apps/web/e2e/a11y.spec.ts
apps/web/e2e/assets.spec.ts
apps/web/e2e/offline.spec.ts
apps/web/e2e/performance.spec.ts
apps/web/e2e/phase13.spec.ts
apps/web/e2e/photo-to-3d.spec.ts
apps/web/e2e/release.spec.ts
apps/web/e2e/run12.spec.ts
apps/web/e2e/scene03.spec.ts
apps/web/e2e/smoke.spec.ts
apps/web/e2e/training.spec.ts
apps/web/e2e/vertical-slice.spec.ts
apps/web/index.html
apps/web/package.json
apps/web/playwright.config.ts
apps/web/src/components/AppShell.test.tsx
apps/web/src/components/AppShell.tsx
apps/web/src/components/editor/ProposalsPanel.tsx
apps/web/src/routeTree.gen.ts
apps/web/src/routes/assets.tsx
apps/web/src/routes/edit.$guideId.tsx
apps/web/src/routes/index.tsx
apps/web/src/routes/jobs.tsx
apps/web/src/routes/library.tsx
apps/web/src/routes/photo-to-3d.tsx
apps/web/src/routes/run.$guideId.tsx
apps/web/src/routes/scene.$guideId.tsx
apps/web/src/routes/settings.tsx
apps/web/src/routes/sources.$guideId.tsx
apps/web/src/routes/training.$guideId.tsx
apps/web/src/routes/training.player.$guideId.tsx
apps/web/src/services/aiProposals.ts
apps/web/src/services/assetLibrary.ts
apps/web/src/services/companionClient.ts
apps/web/src/services/guideStore.test.ts
apps/web/src/services/guideStore.ts
apps/web/src/services/phase16-golden.test.ts
apps/web/src/services/photoTo3d.ts
apps/web/src/services/proposals.test.ts
apps/web/src/services/roundtrip.test.ts
apps/web/src/services/sceneStore.ts
apps/web/src/services/sourceStudio.test.ts
apps/web/src/services/sourceStudio.ts
apps/web/src/services/sourceSynthesis.test.ts
apps/web/src/services/sourceSynthesis.ts
apps/web/src/services/sw.test.ts
apps/web/src/styles.css
apps/web/src/test/setup.ts
apps/web/vite.config.ts
apps/worker-documents/package.json
apps/worker-documents/src/docling.test.ts
apps/worker-documents/src/index.test.ts
apps/worker-documents/src/index.ts
apps/xr-web/src/main.tsx
apps/xr-web/src/release-gate.test.ts
deploy/pwa/nginx.conf
docs/adr/0006-ai-proposal-pipeline-model-gateway.md
docs/adr/0009-phase-00-truth-baseline-supply-chain-gates.md
docs/adr/0010-phase-01-single-user-architecture-repairs.md
docs/adr/0011-phase-02-canonical-spatial-guide.md
docs/adr/0012-phase-03-complete-spatial-editor.md
docs/adr/0013-phase-04-asset-library.md
docs/adr/0014-phase-05-multimodal-ingestion.md
docs/adr/0015-phase-03-package-storage-recovery.md
docs/adr/0016-phase-04-real-multimodal-ingestion.md
docs/adr/0017-phase-05-deepseek-synthesis-gateway.md
docs/adr/0018-phase-06-training-studio.md
docs/adr/0019-phase-07-training-runtime.md
docs/adr/0020-phase-08-asset-safety-and-providers.md
docs/adr/0021-phase-09-photo-to-3d.md
docs/adr/0022-phase-10-surface-attachments.md
docs/adr/0023-phase-11-spatial-compiler.md
docs/adr/0024-phase-12-procedure-runtime.md
docs/adr/0025-phase-13-device-performance.md
docs/adr/0026-phase-14-release-operations.md
docs/adr/0027-phase-15-security-reliability.md
docs/adr/0028-phase-16-golden-certification.md
docs/adr/0029-phase-17-no-cut.md
docs/progress/BASELINE_PERFORMANCE_REPORT.md
docs/progress/CAPABILITY_MATRIX.md
docs/progress/EXECUTION_LEDGER.md
docs/progress/PHASE_00_REPORT.md
docs/progress/PHASE_01_REPORT.md
docs/progress/PHASE_02_REPORT.md
docs/progress/PHASE_03_REPORT.md
docs/progress/PHASE_04_REPORT.md
docs/progress/PHASE_05_REPORT.md
docs/progress/PHASE_06_REPORT.md
docs/progress/PHASE_07_REPORT.md
docs/progress/PHASE_08_REPORT.md
docs/progress/PHASE_09_REPORT.md
docs/progress/PHASE_10_REPORT.md
docs/progress/PHASE_11_REPORT.md
docs/progress/PHASE_12_REPORT.md
docs/progress/PHASE_13_REPORT.md
docs/progress/PHASE_14_REPORT.md
docs/progress/PHASE_15_REPORT.md
docs/progress/PHASE_16_REPORT.md
docs/progress/PHASE_17_REPORT.md
docs/progress/SINGLE_USER_MODES.md
docs/progress/legacy/PHASE_00_REPORT_original.md
docs/progress/legacy/PHASE_01_REPORT_original.md
docs/progress/legacy/PHASE_02_REPORT_original.md
docs/progress/legacy/PHASE_03_REPORT_original.md
docs/progress/legacy/PHASE_04_REPORT_original.md
docs/progress/legacy/PHASE_05_REPORT_original.md
docs/progress/legacy/PHASE_06_REPORT_original.md
docs/progress/legacy/PHASE_07_REPORT_original.md
docs/progress/legacy/PHASE_08_REPORT_original.md
docs/security/reviewed-exceptions.json
docs/security/reviewed-exceptions.schema.json
docs/security/supply-chain-policy.md
infra/docker/.env.example
infra/docker/docker-compose.yml
package.json
packages/ai-contracts/src/index.test.ts
packages/ai-contracts/src/index.ts
packages/assets/package.json
packages/assets/schemas/AssetMetadata.schema.json
packages/assets/src/index.test.ts
packages/assets/src/index.ts
packages/assets/src/photo-to-3d.test.ts
packages/assets/src/photo-to-3d.ts
packages/assets/tsconfig.json
packages/collaboration/package.json
packages/collaboration/src/index.test.ts
packages/collaboration/src/index.ts
packages/collaboration/src/scene-converters.ts
packages/commands/src/guide-commands.ts
packages/commands/src/guide-reducer.test.ts
packages/commands/src/guide-reducer.ts
packages/commands/src/index.ts
packages/domain/package.json
packages/domain/src/index.test.ts
packages/domain/src/index.ts
packages/guide-schema/schemas/GuideSnapshot.schema.json
packages/guide-schema/src/comparison.ts
packages/guide-schema/src/execution-runtime.test.ts
packages/guide-schema/src/execution-runtime.ts
packages/guide-schema/src/index.test.ts
packages/guide-schema/src/index.ts
packages/guide-schema/src/migrations.ts
packages/guide-schema/src/training-interop.ts
packages/guide-schema/src/training-runtime.test.ts
packages/guide-schema/src/training-runtime.ts
packages/guide-schema/src/training.ts
packages/ingestion/package.json
packages/ingestion/src/index.test.ts
packages/ingestion/src/index.ts
packages/ingestion/tsconfig.json
packages/interop-ms-guide/src/index.test.ts
packages/interop-ms-guide/src/index.ts
packages/model-gateway/src/index.test.ts
packages/model-gateway/src/index.ts
packages/package-gforge/schemas/PackageManifest.schema.json
packages/package-gforge/src/drills.test.ts
packages/package-gforge/src/fuzz.test.ts
packages/package-gforge/src/index.test.ts
packages/package-gforge/src/index.ts
packages/package-gforge/src/release.ts
packages/package-gforge/src/signing.test.ts
packages/scene-core/src/index.test.ts
packages/scene-core/src/index.ts
packages/scene-core/src/scene-reducer.ts
packages/scene-react/tsconfig.json
packages/spatial-compiler/package.json
packages/spatial-compiler/src/index.test.ts
packages/spatial-compiler/src/index.ts
packages/spatial-compiler/tsconfig.json
packages/storage-web/package.json
packages/storage-web/schemas/AiProposalRecord.schema.json
packages/storage-web/schemas/EvidenceRecord.schema.json
packages/storage-web/schemas/PhotoTo3DJobRecord.schema.json
packages/storage-web/schemas/RuntimeCompletionReport.schema.json
packages/storage-web/schemas/RuntimeSessionRecord.schema.json
packages/storage-web/schemas/TrainingSessionRecord.schema.json
packages/storage-web/src/index.test.ts
packages/storage-web/src/index.ts
packages/storage-web/src/schema-validation.ts
packages/synthesis/package.json
packages/synthesis/src/extract.ts
packages/synthesis/src/gateway.test.ts
packages/synthesis/src/gateway.ts
packages/synthesis/src/index.test.ts
packages/synthesis/src/index.ts
packages/synthesis/src/synthesize.ts
packages/synthesis/src/types.ts
packages/synthesis/src/validate.ts
packages/synthesis/tsconfig.json
pnpm-lock.yaml
pnpm-workspace.yaml
release/tauri-matrix.json
release/version-policy.json
scripts/build-release-metadata.mjs
scripts/check-audit-policy.mjs
scripts/check-boundaries.mjs
scripts/check-deps.mjs
scripts/check-license-policy.mjs
scripts/check-release-policy.mjs
scripts/check-web-bundle.mjs
scripts/policy-scripts.test.mjs
scripts/release-lifecycle.mjs
scripts/release-recovery-drill.mjs
scripts/secret-scan.sh
scripts/verify-release-candidate.mjs
turbo.json
[0m
[0m$ [0mls apps packages 2>/dev/null
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
apps:
api
collab
companion
desktop
web
worker-documents
xr-web

packages:
ai-contracts
assets
collaboration
commands
domain
guide-schema
ingestion
interop-ms-guide
model-gateway
package-gforge
scene-core
scene-react
spatial-compiler
storage-native
storage-web
synthesis
telemetry
ui
[0m
Large diff (~40k lines). I'll review the four focus areas in parallel — reading core files myself and dispatching subagents for breadth.
[0m$ [0mgit diff origin/main...HEAD -- packages/guide-schema/src/migrations.ts packages/domain/src/index.ts | head -500
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
diff --git a/packages/domain/src/index.ts b/packages/domain/src/index.ts
index f9514b0..0e5d79d 100644
--- a/packages/domain/src/index.ts
+++ b/packages/domain/src/index.ts
@@ -4,6 +4,8 @@
  * MUST remain framework-independent: no React, Three.js, Yjs, Dexie, Node,
  * Tauri, or database imports (enforced by `boundary` check).
  */
+import { sha256 } from '@noble/hashes/sha2.js';
+import { bytesToHex } from '@noble/hashes/utils.js';
 
 /** Deterministic UUID v4 generated outside the domain (injected). */
 export type EntityId = string & { readonly __brand: 'EntityId' };
@@ -19,6 +21,16 @@ export function isContentHash(value: string): value is ContentHash {
   return /^[0-9a-f]{64}$/i.test(value);
 }
 
+/**
+ * Real SHA-256 digest of arbitrary bytes, hex-encoded (64 lowercase chars).
+ * Uses @noble/hashes (pure JS, audited, browser + node safe) — never FNV or
+ * a padded short hash. Runtime callers must verify `isContentHash` on the
+ * result when the value is typed as a ContentHash.
+ */
+export function sha256Hex(data: Uint8Array): string {
+  return bytesToHex(sha256(data));
+}
+
 /** Guide lifecycle states (canonical release state machine). */
 export type GuideLifecycleState = 'draft' | 'in-review' | 'approved' | 'signing' | 'released';
 
@@ -90,3 +102,54 @@ export interface GuideMetadata {
   createdAtIso: string;
   updatedAtIso: string;
 }
+
+/** Multimodal source kinds shared by ingestion, storage, and project state. */
+export type SourceKind =
+  | 'pdf'
+  | 'docx'
+  | 'pptx'
+  | 'xlsx'
+  | 'csv'
+  | 'html'
+  | 'text'
+  | 'image'
+  | 'audio'
+  | 'video'
+  | 'unknown';
+
+/** Stable source location used by citations and source regions. */
+export type SourceLocator =
+  | { kind: 'page'; pageIndex: number; bbox?: [number, number, number, number] }
+  | { kind: 'time'; startMs: number; endMs: number }
+  | { kind: 'sheet'; sheet: string; range: string }
+  | { kind: 'slide'; slideIndex: number; bbox?: [number, number, number, number] };
+
+/** Canonical source region; contentHash is SHA-256 of the region content. */
+export interface CanonicalSourceRegion {
+  regionId: string;
+  sourceHash: ContentHash;
+  locator: SourceLocator;
+  structuralPath: string;
+  type: string;
+  text?: string;
+  contentHash: ContentHash;
+  confidence: number;
+}
+
+/** Source provenance owned by the canonical project, not browser metadata. */
+export interface CanonicalSource {
+  sourceId: EntityId;
+  sha256: ContentHash;
+  originalName: string;
+  mediaType: string;
+  kind: SourceKind;
+  sizeBytes: number;
+  pageCount: number | null;
+  durationMs: number | null;
+  receivedAtIso: string;
+  pipeline: string;
+  pipelineVersion: string;
+  status: 'pending' | 'processing' | 'ready' | 'partial' | 'cancelled' | 'failed';
+  regions: CanonicalSourceRegion[];
+  provenanceReceipt: Record<string, unknown>;
+}
diff --git a/packages/guide-schema/src/migrations.ts b/packages/guide-schema/src/migrations.ts
index 114af27..6972812 100644
--- a/packages/guide-schema/src/migrations.ts
+++ b/packages/guide-schema/src/migrations.ts
@@ -6,7 +6,16 @@
  * migration in sequence until reaching the target version. It never mutates
  * its input.
  */
-import { GUIDE_SCHEMA_VERSION, type GuideSnapshot } from './index.js';
+import { sha256Hex, type ContentHash, type EntityId } from '@guideforge/domain';
+import {
+  createEmptyScene,
+  createEmptyTraining,
+  GUIDE_SCHEMA_VERSION,
+  type GuideSnapshot,
+  type GuideSource,
+  type LegacySourceRecord,
+  type SourceRegion,
+} from './index.js';
 
 export interface SchemaMigration {
   fromVersion: number;
@@ -17,6 +26,237 @@ export interface SchemaMigration {
 
 const MIGRATIONS: SchemaMigration[] = [];
 
+/**
+ * v1 -> v2: the guide gains canonical scene, training, and source structures.
+ * v1 snapshots carry only procedure content; the new structures start empty.
+ */
+registerMigration({
+  fromVersion: 1,
+  toVersion: 2,
+  migrate: (input) => {
+    const next = { ...input, schemaVersion: 2 } as Record<string, unknown>;
+    if (!('scene' in next)) next.scene = createEmptyScene();
+    if (!('training' in next)) next.training = createEmptyTraining();
+    if (!('sources' in next)) next.sources = [];
+    return next;
+  },
+});
+
+/**
+ * v3 -> v4: provenance becomes part of the canonical project. The source
+ * rows that previously lived only in Dexie are converted by the same pure
+ * mapper used by the storage adapter; old snapshot sources get the new
+ * defaults without losing their existing regions.
+ */
+registerMigration({
+  fromVersion: 3,
+  toVersion: 4,
+  migrate: (input) => {
+    const next = { ...input, schemaVersion: 4 } as Record<string, unknown>;
+    if (Array.isArray(next.steps)) {
+      next.steps = (next.steps as unknown[]).map((step: unknown) => {
+        if (typeof step !== 'object' || step === null) return step;
+        const s = { ...step } as Record<string, unknown>;
+        if (!Array.isArray(s.claimIds)) s.claimIds = [];
+        return s;
+      });
+    }
+    const scene = next.scene as Record<string, unknown> | undefined;
+    if (scene && !Array.isArray(scene.anchors)) scene.anchors = [];
+    const training = next.training as Record<string, unknown> | undefined;
+    if (training && !Array.isArray(training.lessons)) training.lessons = [];
+    if (!Array.isArray(next.claims)) next.claims = [];
+    if (!Array.isArray(next.citations)) next.citations = [];
+    if (!Array.isArray(next.generationRuns)) next.generationRuns = [];
+    if (Array.isArray(next.sources)) {
+      next.sources = next.sources.map((source: unknown) => normalizeSnapshotSource(source));
+    }
+    return next;
+  },
+});
+
+/**
+ * v4 -> v5: mesh-local surface attachments become first-class scene data.
+ * Existing anchors are retained for old readers and copied into a conservative
+ * needs-correction attachment rather than being treated as verified geometry.
+ */
+registerMigration({
+  fromVersion: 4,
+  toVersion: 5,
+  migrate: (input) => {
+    const next = { ...input, schemaVersion: 5 } as Record<string, unknown>;
+    const scene = next.scene as Record<string, unknown> | undefined;
+    if (scene) {
+      const anchors = Array.isArray(scene.anchors) ? scene.anchors : [];
+      if (!Array.isArray(scene.surfaceAttachments)) {
+        scene.surfaceAttachments = anchors.flatMap((value: unknown) => {
+          if (typeof value !== 'object' || value === null) return [];
+          const anchor = value as Record<string, unknown>;
+          if (typeof anchor.anchorId !== 'string' || typeof anchor.nodeId !== 'string') return [];
+          const localPoint = anchor.localPoint;
+          if (typeof localPoint !== 'object' || localPoint === null) return [];
+          return [
+            {
+              attachmentId: anchor.anchorId,
+              nodeId: anchor.nodeId,
+              assetHash: null,
+              meshName: null,
+              primitiveIndex: null,
+              triangleIndex: null,
+              barycentric: null,
+              localPoint,
+              normal: anchor.normal ?? null,
+              source: 'legacy',
+              confidence: typeof anchor.confidence === 'number' ? anchor.confidence : 0,
+              reviewState: 'needs-correction',
+            },
+          ];
+        });
+      }
+      if (Array.isArray(scene.annotations)) {
+        scene.annotations = scene.annotations.map((value: unknown) => {
+          if (typeof value !== 'object' || value === null) return value;
+          const annotation = { ...value } as Record<string, unknown>;
+          annotation.attachmentId = annotation.attachmentId ?? null;
+          annotation.pathPoints = annotation.pathPoints ?? [];
+          return annotation;
+        });
+      }
+    }
+    return next;
+  },
+});
+
+function normalizeSnapshotSource(value: unknown): unknown {
+  if (typeof value !== 'object' || value === null) return value;
+  const source = { ...value } as Record<string, unknown>;
+  source.kind = source.kind ?? 'unknown';
+  source.receivedAtIso = source.receivedAtIso ?? '1970-01-01T00:00:00.000Z';
+  source.status = source.status ?? 'ready';
+  if (Array.isArray(source.regions)) {
+    source.regions = source.regions.map((region: unknown) => {
+      if (typeof region !== 'object' || region === null) return region;
+      const r = { ...region } as Record<string, unknown>;
+      const text = typeof r.text === 'string' ? r.text : '';
+      r.sourceHash = r.sourceHash ?? source.sha256;
+      r.locator = r.locator ?? { kind: 'page', pageIndex: 0 };
+      r.contentHash = r.contentHash ?? hashText(text);
+      r.confidence = r.confidence ?? 1;
+      return r;
+    });
+  }
+  return source;
+}
+
+/** Convert a legacy Dexie SourceRecord into canonical project provenance. */
+export function migrateLegacySourceRecord(input: LegacySourceRecord): GuideSource {
+  const sourceHash = input.sha256 as ContentHash;
+  const regions: SourceRegion[] = [];
+  const seen = new Set<string>();
+  const add = (region: SourceRegion): void => {
+    if (seen.has(region.regionId)) return;
+    seen.add(region.regionId);
+    regions.push(region);
+  };
+
+  for (const region of input.regions) {
+    add({
+      regionId: region.regionId,
+      sourceHash,
+      locator: region.locator ?? { kind: 'page', pageIndex: region.pageIndex },
+      structuralPath: region.structuralPath,
+      type: region.kind,
+      text: region.excerpt,
+      contentHash: hashText(region.excerpt),
+      confidence: 1,
+    });
+  }
+  for (const table of input.tables) {
+    const text = [table.header, ...table.rows].map((row) => row.join('\u241e')).join('\u241f');
+    add({
+      regionId: table.regionId,
+      sourceHash,
+      locator: { kind: 'page', pageIndex: table.pageIndex },
+      structuralPath: `table:${table.regionId}`,
+      type: 'table',
+      text,
+      contentHash: hashText(text),
+      confidence: 1,
+    });
+  }
+  for (const segment of input.mediaSegments) {
+    const text = segment.transcript ?? '';
+    add({
+      regionId: segment.segmentId,
+      sourceHash,
+      locator: {
+        kind: 'time',
+        startMs: Math.round(segment.startSec * 1000),
+        endMs: Math.round(segment.endSec * 1000),
+      },
+      structuralPath: `media:${segment.kind}:${segment.startSec}`,
+      type: segment.kind,
+      ...(text ? { text } : {}),
+      contentHash: hashText(text || `${segment.kind}:${segment.startSec}:${segment.endSec}`),
+      confidence: 1,
+    });
+  }
+
+  return {
+    sourceId: input.sourceId as EntityId,
+    sha256: sourceHash,
+    originalName: input.originalFilename,
+    mediaType: input.detectedType,
+    kind: input.kind,
+    sizeBytes: input.sizeBytes,
+    pageCount: input.pageCount,
+    durationMs: null,
+    receivedAtIso: input.receivedAtIso,
+    pipeline: input.receipt?.converter ?? 'legacy-dexie',
+    pipelineVersion: input.receipt?.pipelineVersion ?? 'v3',
+    status: legacyStatus(input.status),
+    regions,
+    provenanceReceipt: {
+      receipt: input.receipt,
+      ocrRoute: input.ocrRoute,
+      conflicts: input.conflicts,
+    },
+  };
+}
+
+function legacyStatus(status: LegacySourceRecord['status']): GuideSource['status'] {
+  if (status === 'complete') return 'ready';
+  if (status === 'asr-pending') return 'processing';
+  return status;
+}
+
+function hashText(text: string): ContentHash {
+  return sha256Hex(new TextEncoder().encode(text)) as ContentHash;
+}
+
+/**
+ * v2 -> v3: GuideStep gains values, conditions, and verification arrays
+ * (Phase 06 source-grounded procedure synthesis). Existing steps start empty.
+ */
+registerMigration({
+  fromVersion: 2,
+  toVersion: 3,
+  migrate: (input) => {
+    const next = { ...input, schemaVersion: 3 } as Record<string, unknown>;
+    if (Array.isArray(next.steps)) {
+      next.steps = (next.steps as unknown[]).map((step: unknown) => {
+        if (typeof step !== 'object' || step === null) return step;
+        const s = { ...step } as Record<string, unknown>;
+        if (!Array.isArray(s.values)) s.values = [];
+        if (!Array.isArray(s.conditions)) s.conditions = [];
+        if (!Array.isArray(s.verification)) s.verification = [];
+        return s;
+      });
+    }
+    return next;
+  },
+});
+
 /**
  * Register a migration. The canonical list is derived from this module; tests
  * assert the chain is contiguous and ends at GUIDE_SCHEMA_VERSION.
@@ -67,9 +307,11 @@ import { isGuideSnapshot } from './index.js';
 
 export function migrationChainComplete(): boolean {
   const versions = MIGRATIONS.map((m) => m.fromVersion).sort((a, b) => a - b);
-  if (versions.length === 0 && GUIDE_SCHEMA_VERSION === 1) return true;
+  // The chain must be contiguous from 1 up to (current - 1): every older
+  // version must have exactly one forward migration.
+  if (versions.length === 0) return (GUIDE_SCHEMA_VERSION as number) === 1;
   for (let i = 0; i < versions.length; i++) {
     if (versions[i] !== i + 1) return false;
   }
-  return true;
+  return versions.length === GUIDE_SCHEMA_VERSION - 1;
 }
[0m
[0m$ [0mgit diff origin/main...HEAD -- packages/guide-schema/src/index.ts | head -400
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
diff --git a/packages/guide-schema/src/index.ts b/packages/guide-schema/src/index.ts
index a14907c..ec7409f 100644
--- a/packages/guide-schema/src/index.ts
+++ b/packages/guide-schema/src/index.ts
@@ -6,9 +6,17 @@
  * Framework-independent: no React/Node/db imports.
  */
 
-import type { EntityId, GuideLifecycleState } from '@guideforge/domain';
+import type {
+  CanonicalSource,
+  CanonicalSourceRegion,
+  ContentHash,
+  EntityId,
+  GuideLifecycleState,
+  SourceKind,
+  SourceLocator,
+} from '@guideforge/domain';
 
-export const GUIDE_SCHEMA_VERSION = 1;
+export const GUIDE_SCHEMA_VERSION = 5;
 
 export interface GuideWarning {
   warningId: EntityId;
@@ -27,6 +35,23 @@ export interface GuidePart {
   quantity: number;
 }
 
+export interface GuideValue {
+  valueId: EntityId;
+  label: string;
+  value: string;
+  unit?: string;
+}
+
+export interface GuideCondition {
+  conditionId: EntityId;
+  text: string;
+}
+
+export interface GuideVerification {
+  verificationId: EntityId;
+  text: string;
+}
+
 export interface MediaReference {
   referenceId: EntityId;
   /** SHA-256 of the referenced asset. */
@@ -44,7 +69,15 @@ export interface GuideStep {
   warnings: GuideWarning[];
   tools: GuideTool[];
   parts: GuidePart[];
+  /** Named values with units, grounded in cited source regions (Phase 06). */
+  values: GuideValue[];
+  /** Branching conditions for the step (Phase 06). */
+  conditions: GuideCondition[];
+  /** Verification checks that confirm the step was done correctly (Phase 06). */
+  verification: GuideVerification[];
   media: MediaReference[];
+  /** First-class claims grounded in the canonical source/citation graph. */
+  claimIds: EntityId[];
 }
 
 export interface GuideTask {
@@ -53,8 +86,424 @@ export interface GuideTask {
   stepIds: EntityId[];
 }
 
+// ---------------------------------------------------------------------------
+// Spatial scene (canonical, JSON-safe; no Map in the snapshot)
+// ---------------------------------------------------------------------------
+
+export interface SceneTransform {
+  position: { x: number; y: number; z: number };
+  rotation: { x: number; y: number; z: number; w: number };
+  scale: { x: number; y: number; z: number };
+}
+
+export interface SceneNode {
+  nodeId: EntityId;
+  name: string;
+  parentId: EntityId | null;
+  /** SHA-256 of the source asset (GLB/GLTF). */
+  assetHash: string | null;
+  transform: SceneTransform;
+  layerId: string;
+  visible: boolean;
+  locked: boolean;
+  metadata: Record<string, string>;
+}
+
+export interface SceneLayer {
+  layerId: string;
+  name: string;
+  visible: boolean;
+  locked: boolean;
+  color: string;
+}
+
+export interface SceneCamera {
+  cameraId: EntityId;
+  name: string;
+  position: { x: number; y: number; z: number };
+  target: { x: number; y: number; z: number };
+  orthographic: boolean;
+  zoom: number;
+}
+
+export interface SceneMeasurement {
+  measurementId: EntityId;
+  name: string;
+  fromNodeId: EntityId;
+  toNodeId: EntityId;
+  value: number | null;
+}
+
+export interface SceneAnnotation {
+  annotationId: EntityId;
+  kind: 'arrow' | 'label' | 'callout' | 'highlight' | 'path';
+  text: string;
+  /** Durable mesh-local attachment; targetPoint is retained for v4 readers. */
+  attachmentId: EntityId | null;
+  /** Semantic anchor reference (nodeId + local point). */
+  targetNodeId: EntityId;
+  targetPoint: { x: number; y: number; z: number } | null;
+  /** Screen-space offset for labels/callouts. */
+  offset: { x: number; y: number } | null;
+  /** Optional mesh-local path points for path annotations. */
+  pathPoints: { x: number; y: number; z: number }[];
+  color: string;
+}
+
+/** Durable mesh-local anchor referenced by annotations and future planners. */
+export interface SceneAnchor {
+  anchorId: EntityId;
+  nodeId: EntityId;
+  label: string;
+  localPoint: { x: number; y: number; z: number };
+  normal: { x: number; y: number; z: number } | null;
+  confidence: number;
+}
+
+export type SurfaceAttachmentSource = 'user' | 'raycast' | 'vision' | 'procedural' | 'legacy';
+export type SurfaceAttachmentReviewState = 'draft' | 'reviewed' | 'needs-correction';
+
+/** Durable barycentric/mesh-local target that survives node transforms. */
+export interface SurfaceAttachment {
+  attachmentId: EntityId;
+  nodeId: EntityId;
+  assetHash: string | null;
+  meshName: string | null;
+  primitiveIndex: number | null;
+  triangleIndex: number | null;
+  barycentric: { x: number; y: number; z: number } | null;
+  localPoint: { x: number; y: number; z: number };
+  normal: { x: number; y: number; z: number } | null;
+  source: SurfaceAttachmentSource;
+  confidence: number;
+  reviewState: SurfaceAttachmentReviewState;
+}
+
+/** Canonical scene graph — the authoritative scene inside the guide. */
+export interface GuideScene {
+  nodes: SceneNode[];
+  rootOrder: EntityId[];
+  layers: SceneLayer[];
+  cameras: SceneCamera[];
+  measurements: SceneMeasurement[];
+  annotations: SceneAnnotation[];
+  anchors: SceneAnchor[];
+  surfaceAttachments: SurfaceAttachment[];
+  /** Scene-state per step (visibility/camera/animation intent). */
+  stepStates: Record<string, { visibleNodeIds: EntityId[]; cameraId: EntityId | null }>;
+}
+
+export function createEmptyScene(): GuideScene {
+  return {
+    nodes: [],
+    rootOrder: [],
+    layers: [
+      { layerId: 'default', name: 'Default', visible: true, locked: false, color: '#2dd4bf' },
+    ],
+    cameras: [],
+    measurements: [],
+    annotations: [],
+    anchors: [],
+    surfaceAttachments: [],
+    stepStates: {},
+  };
+}
+
+/** Normalize a scene from v4 or older working documents into the v5 shape. */
+export function migrateSceneToCurrent(value: unknown): GuideScene {
+  if (typeof value !== 'object' || value === null) return createEmptyScene();
+  const raw = value as Partial<GuideScene>;
+  const anchors = Array.isArray(raw.anchors) ? raw.anchors : [];
+  const surfaceAttachments = Array.isArray(raw.surfaceAttachments)
+    ? raw.surfaceAttachments
+    : anchors.map((anchor) => ({
+        attachmentId: anchor.anchorId,
+        nodeId: anchor.nodeId,
+        assetHash: null,
+        meshName: null,
+        primitiveIndex: null,
+        triangleIndex: null,
+        barycentric: null,
+        localPoint: { ...anchor.localPoint },
+        normal: anchor.normal ? { ...anchor.normal } : null,
+        source: 'legacy' as const,
+        confidence: anchor.confidence,
+        reviewState: 'needs-correction' as const,
+      }));
+  return {
+    ...createEmptyScene(),
+    ...raw,
+    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
+    rootOrder: Array.isArray(raw.rootOrder) ? raw.rootOrder : [],
+    layers: Array.isArray(raw.layers) ? raw.layers : createEmptyScene().layers,
+    cameras: Array.isArray(raw.cameras) ? raw.cameras : [],
+    measurements: Array.isArray(raw.measurements) ? raw.measurements : [],
+    annotations: Array.isArray(raw.annotations)
+      ? raw.annotations.map((annotation) => ({
+          ...annotation,
+          attachmentId: annotation.attachmentId ?? null,
+          pathPoints: annotation.pathPoints ?? [],
+        }))
+      : [],
+    anchors,
+    surfaceAttachments,
+    stepStates: raw.stepStates ?? {},
+  };
+}
+
+// ---------------------------------------------------------------------------
+// Training (competencies, objectives, lessons, practice, assessments, mastery)
+// ---------------------------------------------------------------------------
+
+export type TrainingCriticality = 'core' | 'important' | 'supporting';
+
+export interface TrainingCitation {
+  sourceHash: ContentHash;
+  regionId: string;
+}
+
+export interface TrainingCompetency {
+  competencyId: EntityId;
+  title: string;
+  description: string;
+  objectiveIds: EntityId[];
+  citations: TrainingCitation[];
+  criticality: TrainingCriticality;
+}
+
+export interface LearningObjective {
+  objectiveId: EntityId;
+  competencyId?: EntityId;
+  verb: string;
+  target: string;
+  conditions: string;
+  criterion: string;
+  /** Linked procedure step ids. */
+  stepIds: EntityId[];
+  /** Source region citations (sourceHash + regionId). */
+  citations: TrainingCitation[];
+  criticality: TrainingCriticality;
+}
+
+export interface AssessmentItem {
+  itemId: EntityId;
+  objectiveId: EntityId;
+  prompt: string;
+  interaction: 'single-choice' | 'multiple-response' | 'ordering' | 'numeric' | 'short-answer';
+  options: { optionId: string; text: string }[];
+  /** Correct option ids / numeric answer / scoring rule. */
+  scoringRule: Record<string, unknown>;
+  rationale: string;
+  /** Explicit feedback shown after the item is scored. */
+  feedback?: { correct: string; incorrect: string };
+  citations: TrainingCitation[];
+  criticality: TrainingCriticality;
+  reviewState: 'draft' | 'reviewed';
+}
+
+export interface TrainingModule {
+  moduleId: EntityId;
+  title: string;
+  competencyIds?: EntityId[];
+  objectiveIds: EntityId[];
+  lessonIds: EntityId[];
+}
+
+export interface TrainingLesson {
+  lessonId: EntityId;
+  title: string;
+  stepIds: EntityId[];
+  objectiveIds: EntityId[];
+  activityIds?: EntityId[];
+  citations: TrainingCitation[];
+}
+
+export interface TrainingActivity {
+  activityId: EntityId;
+  lessonId: EntityId;
+  title: string;
+  type: 'instruction' | 'procedure' | 'practice' | 'reflection';
+  stepIds: EntityId[];
+  objectiveIds: EntityId[];
+  itemIds: EntityId[];
+  citations: TrainingCitation[];
+}
+
+export interface TrainingAssessmentBlueprint {
+  blueprintId: EntityId;
+  title: string;
+  objectiveIds: EntityId[];
+  itemIds: EntityId[];
+  criticalItemIds: EntityId[];
+  passThreshold: number;
+  maxAttempts: number;
+  citations: TrainingCitation[];
+}
+
+export interface TrainingRemediationEdge {
+  edgeId: EntityId;
+  fromItemId: EntityId;
+  toActivityId: EntityId;
+  trigger: 'incorrect' | 'low-confidence' | 'incomplete';
+  reason: string;
+  citations: TrainingCitation[];
+}
+
+export interface TrainingMasteryPolicy {
+  requiredCriticalItems: number;
+  passThreshold: number;
+  maxAttempts: number;
+  policyVersion?: string;
+  requiredObjectiveIds?: EntityId[];
+  criticalItemIds?: EntityId[];
+  remediationThreshold?: number;
+}
+
+export interface TrainingState {
+  /** Optional for v4 backward compatibility; generated programs always fill it. */
+  competencies?: TrainingCompetency[];
+  objectives: LearningObjective[];
+  assessmentItems: AssessmentItem[];
+  modules: TrainingModule[];
+  lessons: TrainingLesson[];
+  activities?: TrainingActivity[];
+  assessmentBlueprint?: TrainingAssessmentBlueprint;
+  remediationEdges?: TrainingRemediationEdge[];
+  mastery: TrainingMasteryPolicy;
+}
+
+export function createEmptyTraining(): TrainingState {
+  return {
+    competencies: [],
+    objectives: [],
+    assessmentItems: [],
+    modules: [],
+    lessons: [],
+    activities: [],
+    assessmentBlueprint: {
+      blueprintId: 'training-blueprint-empty' as EntityId,
+      title: 'Assessment blueprint',
+      objectiveIds: [],
+      itemIds: [],
+      criticalItemIds: [],
+      passThreshold: 0.8,
+      maxAttempts: 3,
+      citations: [],
+    },
+    remediationEdges: [],
+    mastery: {
+      requiredCriticalItems: 0,
+      passThreshold: 0.8,
+      maxAttempts: 3,
+      policyVersion: 'mastery-v1',
+      requiredObjectiveIds: [],
+      criticalItemIds: [],
+      remediationThreshold: 0.8,
+    },
+  };
+}
+
+export interface GuideClaim {
+  claimId: EntityId;
+  text: string;
+  kind: 'fact' | 'procedure' | 'warning' | 'value' | 'observation';
+  citationIds: EntityId[];
+  confidence: number;
+  reviewState: 'draft' | 'reviewed' | 'rejected';
+}
+
+export interface GuideCitation {
+  citationId: EntityId;
+  claimId: EntityId;
+  sourceHash: ContentHash;
+  regionId: string;
+  contentHash: ContentHash;
[0m
[0m✱ [0mGrep "citation|Citation"[90m in packages/guide-schema/src · 77 matches[0m
[0m• [0mReview companion app security[90m Delegate Agent[0m
[0m✗ [0mReview companion app security failed[90m Delegate Agent[0m
[91m[1mError: [0mModel not found: openai/gpt-5.3-codex. Did you mean: gpt-5.3-codex-spark?
[0m• [0mHunt leftover multi-tenant surface[90m Delegate Agent[0m
[0m✗ [0mHunt leftover multi-tenant surface failed[90m Delegate Agent[0m
[91m[1mError: [0mModel not found: openai/gpt-5.3-codex. Did you mean: gpt-5.3-codex-spark?
Dispatching three subagents for breadth while I review collaboration/migrations myself.
[0m• [0mReview runtime evidence model[90m General Agent[0m
[0m• [0mHunt leftover multi-tenant surface[90m General Agent[0m
[0m✓ [0mReview runtime evidence model[90m General Agent[0m
[0m✓ [0mHunt leftover multi-tenant surface[90m General Agent[0m
Subagents returned. Verifying their blocking claims and reviewing collaboration/companion myself now.
[0m
[0m$ [0mcat infra/docker/docker-compose.yml && sed -n 1,40p apps/api/src/server.ts
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
name: guideforge

# GuideForge self-hosted stack (Phase 05 control plane).
# Start: docker compose up -d
# Then open http://localhost:1420 (web) and http://localhost:8080/health (api).
#
# Secrets are injected via environment; never commit real values. For local
# dev these defaults are fine; for production override ROOM_TICKET_SECRET and
# SESSION_SECRET with strong random values.

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: guideforge
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-guideforge}
      POSTGRES_DB: guideforge
    volumes:
      - guideforge-pg:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U guideforge']
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://guideforge:${POSTGRES_PASSWORD:-guideforge}@postgres:5432/guideforge
      SESSION_SECRET: ${SESSION_SECRET:-change-me-session}
      ROOM_TICKET_SECRET: ${ROOM_TICKET_SECRET:-change-me-tickets}
      CORS_ORIGIN: http://localhost:1420
      PORT: 8080
      # Real AI provider (server-side only; never exposed to the browser).
      GUIDEFORGE_MODEL_PROVIDER: ${GUIDEFORGE_MODEL_PROVIDER:-openrouter}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
      DEEPSEEK_MODEL: ${DEEPSEEK_MODEL:-deepseek-v4-flash}
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:-}
      OPENROUTER_MODEL: ${OPENROUTER_MODEL:-deepseek/deepseek-v4-flash-0731}
      OPENROUTER_REFERER: ${OPENROUTER_REFERER:-http://localhost:1420}
      OPENROUTER_APP_NAME: ${OPENROUTER_APP_NAME:-GuideForge}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - '8080:8080'

  collab:
    build:
      context: .
      dockerfile: docker/Dockerfile.collab
    restart: unless-stopped
    environment:
      ROOM_TICKET_SECRET: ${ROOM_TICKET_SECRET:-change-me-tickets}
      PORT: 1234
    ports:
      - '1234:1234'

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    restart: unless-stopped
    depends_on:
      - api
      - collab
    ports:
      - '1420:80'

volumes:
  guideforge-pg:
/**
 * API service entrypoint (container/local).
 */
import { buildServer, type ApiConfig } from './index.js';

const port = Number(process.env.PORT ?? 8080);
// Loopback by default (single-owner companion). Network mode requires an
// explicit HOST + HTTPS proxy + ownerId (see docs/security/).
const host = process.env.GUIDEFORGE_HOST ?? '127.0.0.1';
function configuredModelProvider(value: string | undefined): ApiConfig['modelProvider'] {
  if (value === undefined) return undefined;
  if (value === 'deepseek' || value === 'openrouter') return value;
  throw new Error('GUIDEFORGE_MODEL_PROVIDER must be deepseek or openrouter');
}

const modelProvider = configuredModelProvider(process.env.GUIDEFORGE_MODEL_PROVIDER);

async function main() {
  const app = await buildServer({
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://guideforge:guideforge@localhost:5432/guideforge',
    sessionSecret: process.env.SESSION_SECRET ?? 'dev-change-me-session',
    roomTicketSecret: process.env.ROOM_TICKET_SECRET ?? 'dev-change-me-tickets',
    corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:1420').split(','),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.GUIDEFORGE_OWNER_ID ? { ownerId: process.env.GUIDEFORGE_OWNER_ID } : {}),
    ...(process.env.DEEPSEEK_API_KEY ? { deepSeekApiKey: process.env.DEEPSEEK_API_KEY } : {}),
    ...(process.env.DEEPSEEK_MODEL ? { deepSeekModel: process.env.DEEPSEEK_MODEL } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(process.env.OPENROUTER_API_KEY ? { openRouterApiKey: process.env.OPENROUTER_API_KEY } : {}),
    ...(process.env.OPENROUTER_MODEL ? { openRouterModel: process.env.OPENROUTER_MODEL } : {}),
    ...(process.env.OPENROUTER_REFERER
      ? { openRouterReferer: process.env.OPENROUTER_REFERER }
      : {}),
    ...(process.env.OPENROUTER_APP_NAME
      ? { openRouterAppName: process.env.OPENROUTER_APP_NAME }
      : {}),
  });
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
[0m
[0m$ [0msed -n 150,260p apps/api/src/index.ts
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
      return reply.code(403).send({ error: 'origin required for cookie-authenticated writes' });
    }
    if (!allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: `origin not allowed: ${origin}` });
    }
  });

  // Simple per-IP in-memory rate limiter for identity and AI (expensive) routes.
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  function rateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
  function rateLimited(key: string, limit: number, windowMs: number): boolean {
    return !rateLimit(key, limit, windowMs);
  }

  app.get('/health', () => ({ status: 'ok', time: new Date().toISOString() }));

  app.get('/openapi.json', () => app.swagger());

  // Identity: single-owner BFF session. Roles are NEVER accepted from the
  // request body; the server derives the owner role from configuration.
  app.post('/api/session', async (req, reply) => {
    // Rate-limit identity attempts (login brute-force protection).
    const ip = req.ip ?? 'unknown';
    if (rateLimited(`session:${ip}`, 50, 60_000)) {
      return reply.code(429).send({ error: 'too many session attempts; slow down' });
    }
    const body = req.body as {
      userId: string;
      displayName: string;
      email: string;
    };
    if (!body?.userId) {
      return reply.code(401).send({ error: 'missing identity' });
    }
    // Network mode: only the configured owner may establish a session.
    // Loopback/dev mode (no ownerId) treats the caller as the single owner.
    if (config.ownerId && body.userId !== config.ownerId) {
      return reply.code(403).send({ error: 'not the owner' });
    }
    const token = app.jwt.sign({
      sub: body.userId,
      name: body.displayName,
      roles: ['organization-owner'],
    });
    reply.setCookie('gf_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return { ok: true };
  });

  app.get('/api/session', (req) => {
    const session = req.user as { sub?: string; name?: string; roles?: string[] } | undefined;
    if (!session?.sub) return { authenticated: false };
    return {
      authenticated: true,
      userId: session.sub,
      name: session.name,
      roles: session.roles ?? [],
    };
  });

  // Room ticket issuance (authorization-checked)
  app.post('/api/rooms/:guideId/tickets', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'collaborate', 'guide');

    const { guideId } = req.params as { guideId: string };
    const guideRow = await db.query.guides.findFirst({ where: eq(schema.guides.id, guideId) });
    if (!guideRow) return reply.code(404).send({ error: 'guide not found' });

    const token = tickets.issue({
      ticketId: crypto.randomUUID(),
      guideId,
      workspaceId: guideRow.workspaceId,
      userId: session.sub,
      role: 'author',
      permission: 'collaborate',
    });
    return { token, expiresInSeconds: config.roomTicketTtlSeconds ?? 300 };
  });

  /** Resolve a local user id from the OIDC session subject. */
  async function resolveUserId(sub: string): Promise<string> {
    const user = await db.query.users.findFirst({
      where: (u, { eq, and }) => and(eq(u.oidcSubject, sub), eq(u.oidcIssuer, 'test')),
    });
    return user?.id ?? sub;
  }

  // Review/approval workflow
  app.post('/api/guides/:guideId/review', async (req, reply) => {
    const session = req.user as { sub?: string; roles?: string[] } | undefined;
    if (!session?.sub) return reply.code(401).send({ error: 'unauthenticated' });
    requirePermission((session.roles ?? []) as Role[], 'review', 'guide');
    const { guideId } = req.params as { guideId: string };
    const body = req.body as { contentHash: string };
    if (!body.contentHash) return reply.code(400).send({ error: 'contentHash required' });
[0m
[0m$ [0mwc -l packages/collaboration/src/*.ts apps/companion/src/*.ts
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
  175 packages/collaboration/src/index.test.ts
  428 packages/collaboration/src/index.ts
  208 packages/collaboration/src/scene-converters.ts
  597 apps/companion/src/db.ts
   17 apps/companion/src/index.ts
  118 apps/companion/src/security.ts
  644 apps/companion/src/server.test.ts
  538 apps/companion/src/server.ts
 2725 total
[0m
[0m$ [0mgit diff origin/main...HEAD --stat -- packages/collaboration apps/collab | cat
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
 apps/collab/package.json                       |   4 +-
 packages/collaboration/package.json            |   3 +-
 packages/collaboration/src/index.test.ts       |  56 ++++++-
 packages/collaboration/src/index.ts            | 162 ++++++++++++++++++-
 packages/collaboration/src/scene-converters.ts | 208 +++++++++++++++++++++++++
 5 files changed, 427 insertions(+), 6 deletions(-)
[0m
[0m→ [0mRead packages/collaboration/src/index.ts
[0m→ [0mRead apps/companion/src/server.ts
[0m→ [0mRead apps/companion/src/security.ts
[0m
[0m$ [0mgrep -n "consumePairing\|createPairing\|getSession\|createSession\|revokeSession\|revokeAllSessions\|prepare(\|run(\|exec(" apps/companion/src/db.ts | head -40
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
215:      .prepare(
236:      .prepare(
239:      .run(displayName, passwordHash, recoveryHash, now, now);
244:      .prepare('UPDATE owner SET password_hash = ?, recovery_hash = ?, updated_at = ? WHERE id = 1')
245:      .run(passwordHash, recoveryHash, now);
248:  createSession(id: string, tokenHash: string, expiresAt: number, createdAt = Date.now()): void {
250:      .prepare(
253:      .run(id, tokenHash, createdAt, expiresAt);
256:  getSession(tokenHash: string): SessionRecord | undefined {
258:      .prepare(
272:  revokeSession(tokenHash: string, now = Date.now()): void {
274:      .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
275:      .run(now, tokenHash);
278:  revokeAllSessions(now = Date.now()): void {
279:    this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL').run(now);
284:      .prepare(
289:      .run(record.name, record.nonce, record.ciphertext, record.tag, record.updatedAt);
294:      .prepare('SELECT name, nonce, ciphertext, tag, updated_at FROM secrets WHERE name = ?')
308:      .prepare('SELECT name, updated_at FROM secrets ORDER BY name')
314:    this.database.prepare('DELETE FROM secrets WHERE name = ?').run(name);
319:      .prepare(
325:      .run(
337:      .prepare(
346:      .prepare(
355:      .prepare("UPDATE signing_keys SET status = 'retired' WHERE status = 'active'")
356:      .run();
361:      .prepare(
364:      .run(now, reason, keyId);
370:      .prepare(
379:      .run(
395:      .prepare(`SELECT ${PHOTO_JOB_COLUMNS} FROM photo_jobs WHERE job_id = ?`)
403:          .prepare(
408:          .prepare(`SELECT ${PHOTO_JOB_COLUMNS} FROM photo_jobs ORDER BY updated_at DESC`)
420:      .prepare(
423:      .run(status, payloadJson, updatedAt, jobId);
437:        .prepare(
443:        .run(now, now);
446:        .prepare(
461:        .prepare(
467:        .run(workerId, leaseExpiresAt, now, row.job_id);
[0m
[0m$ [0mrg -n "fnv|FNV|legacyHash|legacy_hash|migrat" packages/domain/src packages/guide-schema/src/migrations.ts --no-heading | head -20; rg -ln "sha256" packages/storage-web/src | head
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
packages/guide-schema/src/migrations.ts:2: * Pure schema migration runner.
packages/guide-schema/src/migrations.ts:6: * migration in sequence until reaching the target version. It never mutates
packages/guide-schema/src/migrations.ts:24:  migrate: (input: Record<string, unknown>) => Record<string, unknown>;
packages/guide-schema/src/migrations.ts:36:  migrate: (input) => {
packages/guide-schema/src/migrations.ts:54:  migrate: (input) => {
packages/guide-schema/src/migrations.ts:86:  migrate: (input) => {
packages/guide-schema/src/migrations.ts:152:export function migrateLegacySourceRecord(input: LegacySourceRecord): GuideSource {
packages/guide-schema/src/migrations.ts:244:  migrate: (input) => {
packages/guide-schema/src/migrations.ts:261: * Register a migration. The canonical list is derived from this module; tests
packages/guide-schema/src/migrations.ts:264:export function registerMigration(migration: SchemaMigration): void {
packages/guide-schema/src/migrations.ts:265:  MIGRATIONS.push(migration);
packages/guide-schema/src/migrations.ts:269:export function migrateToCurrent(input: unknown): GuideSnapshot {
packages/guide-schema/src/migrations.ts:271:    throw new Error('migration: input must be an object');
packages/guide-schema/src/migrations.ts:280:      throw new Error(`migration: no migration from schema version ${version}`);
packages/guide-schema/src/migrations.ts:284:        `migration: non-progressing migration ${next.fromVersion} -> ${next.toVersion}`,
packages/guide-schema/src/migrations.ts:287:    current = next.migrate(current);
packages/guide-schema/src/migrations.ts:293:      `migration: could not reach version ${GUIDE_SCHEMA_VERSION} (stopped at ${version})`,
packages/guide-schema/src/migrations.ts:302:    throw new Error('migration result is not a valid GuideSnapshot');
packages/guide-schema/src/migrations.ts:308:export function migrationChainComplete(): boolean {
packages/guide-schema/src/migrations.ts:311:  // version must have exactly one forward migration.
packages/storage-web/src/index.test.ts
packages/storage-web/src/index.ts
[0m
[0m$ [0mrg -n "sha256|isContentHash|hashText" packages/storage-web/src/index.ts | head -30 && rg -n "migrateToCurrent|migrateLegacySourceRecord" apps/web/src packages -l
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
61:  sha256: ContentHash;
186:      sources: 'sourceId, guideId, sha256, receivedAtIso',
193:      sourceBlobs: 'sha256',
196:      sources: 'sourceId, guideId, sha256, receivedAtIso',
204:      sourceBlobs: 'sha256',
207:      sources: 'sourceId, guideId, sha256, receivedAtIso',
215:      sourceBlobs: 'sha256',
218:      sources: 'sourceId, guideId, sha256, receivedAtIso',
227:      sourceBlobs: 'sha256',
230:      sources: 'sourceId, guideId, sha256, receivedAtIso',
240:      sourceBlobs: 'sha256',
243:      sources: 'sourceId, guideId, sha256, receivedAtIso',
254:      sourceBlobs: 'sha256',
257:      sources: 'sourceId, guideId, sha256, receivedAtIso',
272:        sourceBlobs: 'sha256',
275:        sources: 'sourceId, guideId, sha256, receivedAtIso',
307:  sha256: ContentHash,
310:  const actual = (await sha256Hex(bytes)) as ContentHash;
311:  if (actual !== sha256) throw new Error(`source bytes hash mismatch for ${sha256}`);
312:  await db.sourceBlobs.put({ sha256, bytes: bytes.slice() });
317:  sha256: ContentHash,
319:  const row = await db.sourceBlobs.get(sha256);
328:  return (await sha256Hex(loaded)) === sha256 ? loaded : null;
377:function sha256Hex(bytes: Uint8Array): Promise<string> {
406:    const hash = (await sha256Hex(bytes)) as ContentHash;
429:    return (await sha256Hex(loaded)) === hash ? loaded : null;
483:    const hash = (await sha256Hex(bytes)) as ContentHash;
521:      return (await sha256Hex(bytes)) === hash ? bytes : null;
apps/web/src/services/guideStore.ts
packages/guide-schema/src/migrations.ts
packages/guide-schema/src/index.test.ts
packages/guide-schema/src/index.ts
packages/storage-web/src/index.ts
[0m
[0m$ [0mrg -n "version\(|upgrade|migrateLegacySourceRecord|changes\." packages/storage-web/src/index.ts | head -40
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
15:  migrateLegacySourceRecord,
159:    this.version(1).stores({
164:    this.version(2).stores({
172:    this.version(3).stores({
180:    this.version(4).stores({
189:    this.version(5).stores({
200:    this.version(6).stores({
211:    this.version(7).stores({
223:    this.version(8).stores({
236:    this.version(9).stores({
250:    this.version(10).stores({
267:    this.version(11)
282:      .upgrade(async (tx) => {
302:  return rows.map(migrateLegacySourceRecord);
[0m
[0m→ [0mRead packages/storage-web/src/index.ts[90m [offset=140, limit=200][0m
[0m
[0m$ [0mgit show origin/main:packages/storage-web/src/index.ts | rg -n "version\(|sources|LegacySourceRecord" | head -20; echo ---; git show origin/main:packages/storage-web/src/index.ts | sed -n 1,60p
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
80:    this.version(1).stores({
85:    this.version(2).stores({
---
/**
 * @guideforge/storage-web — browser local-first storage.
 *
 * Storage roles (canonical):
 *   - y-indexeddb: Yjs updates (active collaborative document durability)
 *   - Dexie: library metadata, indexes, jobs, settings, receipts
 *   - OPFS: content-addressed large assets (SHA-256 keyed), with tested
 *     fallback to IndexedDB where OPFS is unavailable
 *
 * Browser-only package (imports `indexedDB`, `navigator.storage`).
 */
import type { ContentHash } from '@guideforge/domain';
import Dexie, { type Table } from 'dexie';
import { IndexeddbPersistence } from 'y-indexeddb';
import type * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Dexie metadata schema
// ---------------------------------------------------------------------------

export interface LibraryGuideMeta {
  guideId: string;
  title: string;
  description: string;
  lifecycleState: string;
  createdAtIso: string;
  updatedAtIso: string;
  taskCount: number;
  stepCount: number;
  /** y-indexeddb document name (== guideId). */
  docName: string;
}

export interface AssetMetaRecord {
  hash: ContentHash;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  /** 'opfs' | 'indexeddb' — where the bytes actually live. */
  location: 'opfs' | 'indexeddb';
}

/** Execution evidence captured on-device (photo/note/signature). */
export interface EvidenceRecord {
  evidenceId: string;
  guideId: string;
  stepId: string;
  kind: 'photo' | 'note' | 'signature' | 'measurement';
  capturedAtIso: string;
  actorId: string;
  /** Free-form note or measurement value. */
  value?: string;
  /** SHA-256 of an optional captured media asset. */
  assetHash?: string;
  mimeType?: string;
}

/** AI proposal awaiting human review. */
export interface AiProposalRecord {
  proposalId: string;
[0m
[0m$ [0mrg -n "migrateRuntimeSession|runtimeContractVersion|contractVersion" packages/guide-schema/src/execution-runtime.ts packages/storage-web/src/index.ts | head; echo ---; rg -n "describe\(|it\(" packages/guide-schema/src/index.test.ts | head -40
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
packages/storage-web/src/index.ts:16:  migrateRuntimeSession,
packages/storage-web/src/index.ts:285:          const migrated = migrateRuntimeSession(value);
packages/guide-schema/src/execution-runtime.ts:464:export function migrateRuntimeSession(value: unknown): RuntimeSession | null {
---
13:describe('guide-schema', () => {
14:  it('exposes the schema version', () => {
18:  it('validates a minimal v5 snapshot', () => {
57:  it('rejects non-snapshots and v1-shaped objects', () => {
77:  it('migrates v1 input to current version with empty structures', () => {
100:  it('migrates v2 steps to v3 with empty values/conditions/verification', () => {
146:  it('migrates v4 anchors into reviewable surface attachments', () => {
213:  it('rejects unknown schema versions', () => {
219:  it('migration chain is contiguous', () => {
223:  it('migrates a legacy Dexie source record into canonical hashed regions', () => {
264:  it('generates a complete source-grounded training graph from procedure steps', () => {
304:  it('fails the quality gate when an item loses its source citation', () => {
[0m
[0m$ [0mrg -n "origin|403|csrf|CSRF|cross-origin|not allowed" apps/companion/src/server.test.ts | head -25
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
77:function cookieHeaders(token: string, origin?: string): Record<string, string> {
80:    ...(origin ? { origin } : {}),
212:  it('enforces origin checks on cookie-authenticated writes', async () => {
225:    expect(noOrigin.statusCode).toBe(403);
226:    expect(badOrigin.statusCode).toBe(403);
[0m
[0m$ [0msed -n 100,135p apps/web/src/routes/run.\$guideId.tsx && rg -n "transaction\(" apps/web/src/services/guideStore.ts | head
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
  const stepIndex = task && step ? task.stepIds.indexOf(step.stepId) : -1;
  const stepState = step ? snapshot?.scene.stepStates[step.stepId] : undefined;
  const camera = stepState?.cameraId
    ? snapshot?.scene.cameras.find((candidate) => candidate.cameraId === stepState.cameraId)
    : undefined;
  const stepAnnotations = stepState
    ? (snapshot?.scene.annotations.filter((annotation) =>
        stepState.visibleNodeIds.includes(annotation.targetNodeId),
      ) ?? [])
    : [];
  const visibleSceneNodes = stepState
    ? (snapshot?.scene.nodes.filter((node) => stepState.visibleNodeIds.includes(node.nodeId)) ?? [])
    : [];
  const verificationChecks = step?.verification ?? [];
  const satisfiedVerificationIds = new Set(
    activeAttempt?.verificationEvidence
      .filter((item) => item.evidenceIds.length > 0)
      .map((item) => item.verificationId) ?? [],
  );
  const minimumEvidenceCount = Math.max(1, verificationChecks.length);
  const canComplete =
    stepEvidence.length >= minimumEvidenceCount &&
    verificationChecks.every((check) => satisfiedVerificationIds.has(check.verificationId));

  async function refreshEvidence() {
    setEvidence(await listEvidence(guideId));
  }

  async function runAction(action: () => Promise<RuntimeSession | void>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setRuntime(next);
      await refreshEvidence();
    } catch (err) {
408:  await guideSession.db.transaction('rw', guideSession.db.trainingSessions, async () => {
797:  await session.db.transaction(
865:  await session.db.transaction(
1773:    await db().transaction(
[0m
[0m$ [0mls infra/docker/ && sed -n 1,60p packages/storage-web/schemas/RuntimeSessionRecord.schema.json
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
docker-compose.yml
Dockerfile.api
Dockerfile.collab
Dockerfile.web
nginx.conf
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://guideforge.dev/schemas/RuntimeSessionRecord.schema.json",
  "title": "GuideForge offline procedure runtime session",
  "type": "object",
  "required": [
    "runtimeVersion",
    "sessionId",
    "guideId",
    "learnerId",
    "stepIds",
    "currentStepIndex",
    "attempts",
    "completions",
    "status",
    "createdAtIso",
    "updatedAtIso",
    "completedAtIso"
  ],
  "properties": {
    "runtimeVersion": { "const": 2 },
    "sessionId": { "type": "string", "minLength": 1 },
    "guideId": { "type": "string", "minLength": 1 },
    "learnerId": { "type": "string", "minLength": 1 },
    "stepIds": { "type": "array", "items": { "type": "string", "minLength": 1 } },
    "currentStepIndex": { "type": "integer", "minimum": 0 },
    "attempts": { "type": "array", "items": { "$ref": "#/$defs/StepAttempt" } },
    "completions": { "type": "array", "items": { "$ref": "#/$defs/StepCompletion" } },
    "status": { "enum": ["in-progress", "completed"] },
    "createdAtIso": { "type": "string", "format": "date-time" },
    "updatedAtIso": { "type": "string", "format": "date-time" },
    "completedAtIso": { "type": ["string", "null"], "format": "date-time" }
  },
  "$defs": {
    "StepAttempt": {
      "type": "object",
      "required": [
        "attemptId",
        "stepId",
        "startedAtIso",
        "updatedAtIso",
        "status",
        "evidenceIds",
        "verificationEvidence"
      ],
      "properties": {
        "attemptId": { "type": "string", "minLength": 1 },
        "stepId": { "type": "string", "minLength": 1 },
        "startedAtIso": { "type": "string", "format": "date-time" },
        "updatedAtIso": { "type": "string", "format": "date-time" },
        "status": { "enum": ["in-progress", "completed"] },
        "evidenceIds": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1 }
        },
        "verificationEvidence": {
          "type": "array",
          "items": { "$ref": "#/$defs/VerificationEvidence" }
        }
[0m
[0m$ [0msed -n 60,134p packages/storage-web/schemas/RuntimeSessionRecord.schema.json; rg -n "additionalProperties" packages/storage-web/schemas/*.json | head
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
        }
      },
      "additionalProperties": false
    },
    "VerificationEvidence": {
      "type": "object",
      "required": ["verificationId", "evidenceIds"],
      "properties": {
        "verificationId": { "type": "string", "minLength": 1 },
        "evidenceIds": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1 }
        }
      },
      "additionalProperties": false
    },
    "CompletionRule": {
      "type": "object",
      "required": [
        "minimumEvidenceCount",
        "allowedEvidenceKinds",
        "verificationCount",
        "requiresExplicitAction"
      ],
      "properties": {
        "minimumEvidenceCount": { "type": "integer", "minimum": 1 },
        "allowedEvidenceKinds": {
          "type": "array",
          "uniqueItems": true,
          "items": { "enum": ["photo", "note", "signature", "measurement"] }
        },
        "verificationCount": { "type": "integer", "minimum": 0 },
        "verificationIds": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1 }
        },
        "requiresExplicitAction": { "const": true }
      },
      "additionalProperties": false
    },
    "StepCompletion": {
      "type": "object",
      "required": [
        "completionId",
        "attemptId",
        "stepId",
        "completedAtIso",
        "completedBy",
        "evidenceIds",
        "rule"
      ],
      "properties": {
        "completionId": { "type": "string", "minLength": 1 },
        "attemptId": { "type": "string", "minLength": 1 },
        "stepId": { "type": "string", "minLength": 1 },
        "completedAtIso": { "type": "string", "format": "date-time" },
        "completedBy": { "type": "string", "minLength": 1 },
        "evidenceIds": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1 }
        },
        "verificationEvidence": {
          "type": "array",
          "items": { "$ref": "#/$defs/VerificationEvidence" }
        },
        "rule": { "$ref": "#/$defs/CompletionRule" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
packages/storage-web/schemas/RuntimeSessionRecord.schema.json:62:      "additionalProperties": false
packages/storage-web/schemas/RuntimeSessionRecord.schema.json:75:      "additionalProperties": false
packages/storage-web/schemas/RuntimeSessionRecord.schema.json:100:      "additionalProperties": false
packages/storage-web/schemas/RuntimeSessionRecord.schema.json:130:      "additionalProperties": false
packages/storage-web/schemas/RuntimeSessionRecord.schema.json:133:  "additionalProperties": false
packages/storage-web/schemas/PhotoTo3DJobRecord.schema.json:6:  "additionalProperties": false,
packages/storage-web/schemas/PhotoTo3DJobRecord.schema.json:53:      "additionalProperties": false,
packages/storage-web/schemas/AiProposalRecord.schema.json:41:        "additionalProperties": false
packages/storage-web/schemas/AiProposalRecord.schema.json:68:      "additionalProperties": false
packages/storage-web/schemas/AiProposalRecord.schema.json:73:  "additionalProperties": false
[0m
[0m$ [0msed -n 30,80p packages/guide-schema/src/execution-runtime.ts && rg -n "verificationEvidence" packages/storage-web/schemas/RuntimeCompletionReport.schema.json packages/guide-schema/src/execution-runtime.ts | head
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
export interface RuntimeVerificationEvidence {
  verificationId: string;
  evidenceIds: string[];
}

export interface StepAttempt {
  attemptId: string;
  stepId: string;
  startedAtIso: string;
  updatedAtIso: string;
  status: 'in-progress' | 'completed';
  evidenceIds: string[];
  verificationEvidence: RuntimeVerificationEvidence[];
}

export interface StepCompletion {
  completionId: string;
  attemptId: string;
  stepId: string;
  completedAtIso: string;
  completedBy: string;
  evidenceIds: string[];
  verificationEvidence: RuntimeVerificationEvidence[];
  rule: RuntimeCompletionRule;
}

export interface RuntimeSession {
  runtimeVersion: typeof EXECUTION_RUNTIME_VERSION;
  sessionId: string;
  guideId: string;
  learnerId: string;
  stepIds: string[];
  currentStepIndex: number;
  attempts: StepAttempt[];
  completions: StepCompletion[];
  status: 'in-progress' | 'completed';
  createdAtIso: string;
  updatedAtIso: string;
  completedAtIso: string | null;
}

export interface RuntimeProgress {
  completedSteps: number;
  totalSteps: number;
  currentStepId: string | null;
  fraction: number;
}

export interface RuntimeReportEvidence {
  evidenceId: string;
  stepId: string;
packages/storage-web/schemas/RuntimeCompletionReport.schema.json:114:        "verificationEvidence",
packages/storage-web/schemas/RuntimeCompletionReport.schema.json:128:        "verificationEvidence": {
packages/guide-schema/src/execution-runtime.ts:42:  verificationEvidence: RuntimeVerificationEvidence[];
packages/guide-schema/src/execution-runtime.ts:52:  verificationEvidence: RuntimeVerificationEvidence[];
packages/guide-schema/src/execution-runtime.ts:178:    const mappedIds = new Set(existing.verificationEvidence.map((item) => item.verificationId));
packages/guide-schema/src/execution-runtime.ts:180:      ...existing.verificationEvidence,
packages/guide-schema/src/execution-runtime.ts:185:    if (nextVerificationEvidence.length === existing.verificationEvidence.length) return session;
packages/guide-schema/src/execution-runtime.ts:190:          ? { ...attempt, verificationEvidence: nextVerificationEvidence, updatedAtIso: nowIso }
packages/guide-schema/src/execution-runtime.ts:207:        verificationEvidence: normalizedVerificationIds.map((verificationId) => ({
packages/guide-schema/src/execution-runtime.ts:231:    attempt.verificationEvidence.find((item) => item.evidenceIds.length === 0)?.verificationId ??
[0m
[0m$ [0mrg -n "apps/api|companion|collab|docker" AGENTS_SINGLE_USER.md docs/adr/0010-phase-01-single-user-architecture-repairs.md | head -20
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
AGENTS_SINGLE_USER.md:79:A local or self-hosted companion provides:
AGENTS_SINGLE_USER.md:91:When the companion is exposed beyond loopback:
docs/adr/0010-phase-01-single-user-architecture-repairs.md:44:   - `apps/api` (`sha256HexText`),
docs/adr/0010-phase-01-single-user-architecture-repairs.md:63:   releases belong to the companion key store / OS secure store.
docs/adr/0010-phase-01-single-user-architecture-repairs.md:103:- CSRF and rate limits harden the network companion.
docs/adr/0010-phase-01-single-user-architecture-repairs.md:133:- A companion signing service is implemented (Phase 07+): signed personal
docs/adr/0010-phase-01-single-user-architecture-repairs.md:141:found that the earlier API hardening was not a real credentialed companion
docs/adr/0010-phase-01-single-user-architecture-repairs.md:143:companion path.
docs/adr/0010-phase-01-single-user-architecture-repairs.md:145:1. `apps/companion` owns the single local owner record in SQLite. First-run
docs/adr/0010-phase-01-single-user-architecture-repairs.md:154:   by group or other users. The web client uses a same-site companion host so
docs/adr/0010-phase-01-single-user-architecture-repairs.md:162:   loading, unavailable companion, owner setup, sign-in, authenticated
docs/adr/0010-phase-01-single-user-architecture-repairs.md:165:The existing `apps/api` BFF remains a compatibility surface for proposal and
docs/adr/0010-phase-01-single-user-architecture-repairs.md:166:review routes. It is not the owner-auth authority for the new companion path,
docs/adr/0010-phase-01-single-user-architecture-repairs.md:167:and the new companion primary flows do not import its org/workspace/RBAC
docs/adr/0010-phase-01-single-user-architecture-repairs.md:172:`apps/companion/src/server.test.ts` has 10 tests covering unknown/wrong
[0m
[0m$ [0msed -n 100,150p apps/api/src/index.ts
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel ?? 'info' } });

  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = deps.db ?? drizzle(pool, { schema });
  const tickets =
    deps.roomTickets ?? new RoomTicketService(config.roomTicketSecret, config.roomTicketTtlSeconds);

  await app.register(cors, { origin: config.corsOrigin ?? true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: config.sessionSecret });
  await app.register(swagger, {
    openapi: { info: { title: 'GuideForge API', version: '0.5.0' }, components: {} },
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof PermissionDeniedError) {
      return reply.code(403).send({ error: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'internal error' });
  });

  app.decorate('db', db);
  app.decorate('tickets', tickets);

  // Read the BFF session cookie into req.user for cookie-authenticated routes.
  app.addHook('preHandler', async (req, _reply) => {
    const cookie = req.cookies.gf_session;
    if (cookie) {
      try {
        req.user = app.jwt.verify(cookie);
      } catch {
        // leave req.user undefined
      }
    }
  });

  // CSRF protection: cookie-authenticated mutating requests must come from an
  // allowed origin. SameSite=lax blocks cross-site POSTs, and this explicit
  // Origin check is defense in depth (network companion requirement).
  const allowedOrigins = config.corsOrigin ?? ['http://localhost:1420'];
  app.addHook('preHandler', async (req, reply) => {
    const method = req.method;
    const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    if (!isMutating) return;
    const hasSession = Boolean(req.cookies.gf_session);
    if (!hasSession) return; // anonymous mutating calls are rejected by auth below
    const origin = req.headers.origin;
    if (!origin) {
      return reply.code(403).send({ error: 'origin required for cookie-authenticated writes' });
[0m
[0m$ [0mrg -n "sources" packages/commands/src/guide-reducer.ts | head -15 && rg -n "malformed|corrupt|ignored" packages/collaboration/src/index.test.ts apps/web/src/services/guideStore.ts | head
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
56:    sources: JSON.parse(JSON.stringify(s.sources)) as GuideSnapshot['sources'],
392:    sources: [],
[0m
[0m$ [0mgit diff origin/main...HEAD -- infra/docker/docker-compose.yml | head -60
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
diff --git a/infra/docker/docker-compose.yml b/infra/docker/docker-compose.yml
index 3db4899..3e1bf19 100644
--- a/infra/docker/docker-compose.yml
+++ b/infra/docker/docker-compose.yml
@@ -36,8 +36,13 @@ services:
       CORS_ORIGIN: http://localhost:1420
       PORT: 8080
       # Real AI provider (server-side only; never exposed to the browser).
+      GUIDEFORGE_MODEL_PROVIDER: ${GUIDEFORGE_MODEL_PROVIDER:-openrouter}
       DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
       DEEPSEEK_MODEL: ${DEEPSEEK_MODEL:-deepseek-v4-flash}
+      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:-}
+      OPENROUTER_MODEL: ${OPENROUTER_MODEL:-deepseek/deepseek-v4-flash-0731}
+      OPENROUTER_REFERER: ${OPENROUTER_REFERER:-http://localhost:1420}
+      OPENROUTER_APP_NAME: ${OPENROUTER_APP_NAME:-GuideForge}
     depends_on:
       postgres:
         condition: service_healthy
[0m
[0m$ [0mgit show origin/main:apps/api/src/index.ts | rg -n "api/session|ownerId|organization-owner" | head; echo ===; git diff origin/main...HEAD --stat -- apps/api/src/index.ts
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
87:  app.post('/api/session', async (req, reply) => {
108:  app.get('/api/session', (req) => {
===
 apps/api/src/index.ts | 320 ++++++++++++++++++++++++++++++++++++++++++++------
 1 file changed, 282 insertions(+), 38 deletions(-)
[0m
[0m$ [0mgit show origin/main:apps/api/src/index.ts | sed -n 80,110p
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

  app.get('/health', () => ({ status: 'ok', time: new Date().toISOString() }));

  app.get('/openapi.json', () => app.swagger());

  // Identity: BFF session (Phase 05 uses a signed session cookie; real OIDC
  // code+PKCE exchange is wired behind a provider adapter).
  app.post('/api/session', async (req, reply) => {
    const body = req.body as {
      userId: string;
      displayName: string;
      email: string;
      roles: string[];
    };
    if (!body?.userId) {
      return reply.code(401).send({ error: 'missing identity' });
    }
    const token = app.jwt.sign({ sub: body.userId, name: body.displayName, roles: body.roles });
    reply.setCookie('gf_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return { ok: true };
  });

  app.get('/api/session', (req) => {
    const session = req.user as { sub?: string; name?: string; roles?: string[] } | undefined;
    if (!session?.sub) return { authenticated: false };
[0m
[0m$ [0msed -n 225,275p packages/package-gforge/src/release.ts
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
        if (
          entry.path !== 'manifest.json' &&
          entry.path !== 'signatures/release-signature.json' &&
          !declaredPaths.has(entry.path)
        ) {
          issues.push(`unlisted package entry ${entry.path}`);
        }
      }
    } catch {
      issues.push('invalid manifest.json');
    }
  }

  // A package that declares itself signed must carry a valid signature.
  // An unsigned personal release is valid but untrusted (reported via the
  // ok flag without a signature issue).
  if (declaredSigned && !signatureEntry)
    issues.push('missing signature (manifest declares signed)');
  if (!declaredSigned && signatureEntry)
    issues.push('signature present but manifest declares unsigned');

  // Verify signature against the canonical manifest JSON.
  if (signatureEntry) {
    try {
      const sigManifest = JSON.parse(
        new TextDecoder().decode(signatureEntry.data),
      ) as ReleaseSignatureManifest;
      const payload = JSON.parse(sigManifest.payloadJson) as Record<string, unknown>;
      if (canonicalJsonRfc8785(payload) !== sigManifest.payloadJson) {
        issues.push('signature payload is not canonical');
      }
      const ok = verifyReleaseSignature(
        sigManifest.payloadJson,
        fromHex(sigManifest.signature),
        fromHex(sigManifest.signingKey),
      );
      if (!ok) issues.push('invalid release signature');
      // The signed payload must equal the on-disk manifest.json content.
      if (manifest) {
        const onDisk = canonicalJsonRfc8785(JSON.parse(new TextDecoder().decode(manifest.data)));
        if (onDisk !== sigManifest.payloadJson) {
          issues.push('manifest.json does not match the signed payload');
        }
      }
      return {
        ok: issues.length === 0,
        issues,
        ...(ok
          ? {
              payload: {
                releaseId: String(payload.releaseId),
[0m
[0m$ [0msed -n 800,845p apps/web/src/services/guideStore.ts
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
    session.db.runtimeBlobs,
    async () => {
      await session.db.runtimeSessions.put(runtime);
      await session.db.runtimeBlobs.put(blob);
    },
  );
}

/** Load the current local learner session or create it once for this guide. */
export async function loadRuntimeSession(
  session: OpenGuideSession,
  learnerId = 'local-user',
): Promise<RuntimeSession> {
  const snapshot = materializeSnapshot(session.working);
  const stepIds = flattenStepIds(snapshot);
  const existing = await session.db.runtimeSessions
    .where('guideId')
    .equals(session.guideId)
    .filter((candidate) => candidate.learnerId === learnerId)
    .sortBy('updatedAtIso');
  const current = existing[existing.length - 1];
  if (current && JSON.stringify(current.stepIds) === JSON.stringify(stepIds)) {
    if (!validateRuntimeSessionSchema(current)) {
      throw new Error('stored runtime session does not match the checked-in schema');
    }
    return current;
  }
  const runtime = createRuntimeSession({
    sessionId: uuidv4(),
    guideId: session.guideId,
    learnerId,
    stepIds,
    nowIso: new Date().toISOString(),
  });
  await persistRuntimeSession(session, runtime);
  return runtime;
}

async function addRuntimeEvidence(
  session: OpenGuideSession,
  runtime: RuntimeSession,
  input: EvidenceInput,
): Promise<{ evidenceId: string; runtime: RuntimeSession }> {
  const nowIso = new Date().toISOString();
  const snapshot = materializeSnapshot(session.working);
  const step = snapshot.steps.find((candidate) => candidate.stepId === input.stepId);
[0m
[0m$ [0mrg -ni "org|workspace|rbac|role|tenant|oidc|csrf|permission" apps/companion/src/db.ts apps/companion/src/server.ts | head
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
apps/companion/src/server.ts:68:  return join(homedir(), '.guideforge');
apps/companion/src/server.ts:508:  const host = process.env.GUIDEFORGE_HOST ?? '127.0.0.1';
apps/companion/src/server.ts:509:  const dataDir = process.env.GUIDEFORGE_DATA_DIR ?? defaultDataDir();
apps/companion/src/server.ts:510:  const keyPath = process.env.GUIDEFORGE_TLS_KEY;
apps/companion/src/server.ts:511:  const certPath = process.env.GUIDEFORGE_TLS_CERT;
apps/companion/src/server.ts:513:    throw new Error('GUIDEFORGE_TLS_KEY and GUIDEFORGE_TLS_CERT must be set together');
apps/companion/src/server.ts:528:  if (process.env.GUIDEFORGE_SECRET_KEY) config.secretKey = process.env.GUIDEFORGE_SECRET_KEY;
[0m
[0m$ [0msed -n 1,60p apps/companion/src/db.ts && rg -n "consumePairing" -A 12 apps/companion/src/db.ts | head -18
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
import Database from 'better-sqlite3';
import { chmodSync } from 'node:fs';

export interface OwnerRecord {
  displayName: string;
  passwordHash: string;
  recoveryHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface SecretMetadata {
  name: string;
  updatedAt: number;
}

export interface EncryptedSecretRecord extends SecretMetadata {
  nonce: string;
  ciphertext: string;
  tag: string;
}

export interface SigningKeyRecord {
  keyId: string;
  publicKeyHex: string;
  createdAt: number;
  status: 'active' | 'revoked' | 'retired';
  revokedAt: number | null;
  reason: string | null;
}

export type PhotoJobQueueStatus =
  | 'blocked'
  | 'queued'
  | 'preprocessing'
  | 'shape-draft'
  | 'paused'
  | 'awaiting-approval'
  | 'texturing'
  | 'cleaning'
  | 'completed'
  | 'cancelled'
  | 'failed';

/** Native queue row; the browser mirrors the same payload in Dexie. */
export interface PhotoJobQueueRecord {
  jobId: string;
  providerId: string;
  gpuProfileId: string;
  status: PhotoJobQueueStatus;
  payloadJson: string;
  createdAt: number;
532:  consumePairing(tokenHash: string, now = Date.now()): PairingRow | undefined {
533-    const transaction = this.database.transaction(() => {
534-      const row = this.database
535-        .prepare(
536-          'SELECT id, label, token_hash, created_at, expires_at, used_at FROM pairings WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
537-        )
538-        .get(tokenHash, now) as PairingRow | undefined;
539-      if (!row) return undefined;
540-      this.database.prepare('UPDATE pairings SET used_at = ? WHERE id = ?').run(now, row.id);
541-      return row;
542-    });
543-    return transaction();
544-  }
[0m
[0m$ [0mrg -n -i "sign|trust|pin" docs/security/supply-chain-policy.md | head -15; rg -n -i "self-signed|embedded|trust anchor|pinning|key pinning" docs/adr/002*.md | head -10
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
[0m
[0m$ [0mrg -n -i "sign" docs/adr/0026-phase-14-release-operations.md docs/security/supply-chain-policy.md 2>/dev/null | head -12; rg -rn -i "signingKey|verifyReleaseSignature" apps/xr-web/src/main.tsx | head -5
npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "resolution-mode". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "confirmModulesPurge". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
docs/adr/0026-phase-14-release-operations.md:23:for macOS, notarization. No unsigned local artifact is presented as a supported
docs/adr/0026-phase-14-release-operations.md:31:Use the existing companion key store for signed personal `.gforge` output. The
docs/adr/0026-phase-14-release-operations.md:33:assemble the returned signature, but never receives the private key. Without a
docs/adr/0026-phase-14-release-operations.md:34:companion, the package stays explicitly unsigned.
docs/adr/0026-phase-14-release-operations.md:47:- Platform signing remains visible as a real external dependency instead of an
[0m
VERDICT: APPROVE

No diff-introduced blocker found in the three focus areas; findings below are must-fix follow-ups, none falsifies the branch's core claims.

- **Canonical sources / migrations clean**: chain v1→v5 contiguous and tested (`packages/guide-schema/src/index.test.ts:77,100,146,219,223`); legacy Dexie regions get real SHA-256 via `sha256Hex` (`migrations.ts` `hashText`); blob store/load verify hash both ways (`packages/storage-web/src/index.ts:310-311,328`). Main had Dexie v1-v2 only, so no bad legacy hash population exists.
- **major** — silent provenance loss seam: `materializeSources` swallows unparseable `sourceJson` (`packages/collaboration/src/index.ts:180-186`), then the next command's `setCanonicalSources` clears+rewrites the Y.Map from the dropped snapshot (`index.ts:365,372-381`) — corruption becomes permanent deletion with no warning.
- **Companion is genuinely single-owner**: SQLite default via better-sqlite3 (`apps/companion/src/db.ts:1,143`), zero org/workspace/RBAC/OIDC surface, argon2id + dummy-hash anti-enumeration (`security.ts:22`), hashed rotating session tokens, atomic single-use pairing (`db.ts:532-544`), origin-checked cookie writes with real negative tests asserting 403s (`server.test.ts:212-226`). CSRF/OIDC-era tests that remain are meaningful, not decorative.
- **major** — runtime progress silently reset: `loadRuntimeSession` discards a step-mismatched session and creates a fresh one with no confirm/undo (`apps/web/src/services/guideStore.ts:809-833`), orphaning completions; load path validates Ajv-schema only, so a schema-valid but inconsistent record (`status:'completed'`, 0 completions) renders a fake complete state — strict `isRuntimeSession` guard is bypassed on the hot path.
- **major** — forgeable release trust: `verifyReleasePackage` checks the signature against the key embedded in the package itself (`packages/package-gforge/src/release.ts:247-262`, `sigManifest.signingKey`), so anyone can tamper+re-sign and pass; `apps/xr-web/src/main.tsx:92-100` renders "verified" off this with no key pinning. Violates the spirit of "published releases are… signed"; pin to companion-published keyIds before any external distribution.
- **Evidence model is real, not placeholder**: transactional Dexie writes of evidence+session+blob (`guideStore.ts:865-875`), P-256 attestations self-verified before accept (`:960-976`), completion gated on evidence+all authored verifications (`run.$guideId.tsx:113-122`, `execution-runtime.ts:291-322`), e2e asserts downloaded report sha256/signature/note text (`e2e/run12.spec.ts:90-105`).
- **Pre-existing, not regression**: apps/api `POST /api/session` mints `organization-owner` from self-asserted userId when `GUIDEFORGE_OWNER_ID` unset (`apps/api/src/index.ts:185-211`) — but main accepted arbitrary roles from the body; branch strictly improves it, and ADR 0010 declares api a compatibility surface, not owner authority. Compose still publishes a dead port (container binds 127.0.0.1, `infra/docker/docker-compose.yml:27-50` + `apps/api/src/server.ts:9`) with `change-me-*` defaults — inherited, but fix before shipping compose in an RC.
- **minor**: scene/training Y.Maps excluded from UndoManager scopes (`collaboration/src/index.ts:412-421`) despite LOCAL_USER_ORIGIN tagging; session JSON Schema doesn't require `StepCompletion.verificationEvidence` while TS/report schema do (lenient-accept only, no rejection).
