/**
 * Browser guide store — orchestrates the local-first stack for apps/web:
 *
 *   - Yjs working document (packages/collaboration)
 *   - y-indexeddb persistence + Dexie metadata + OPFS assets (storage-web)
 *   - deterministic draft package export/import (package-gforge)
 *
 * Every mutation goes through typed commands.
 */
import {
  applyCommandToWorkingGuide,
  createEmptyWorkingGuide,
  createWorkingGuide,
  hydrateWorkingGuide,
  materializeSnapshot,
  seedEmptyWorkingGuide,
  type WorkingGuide,
} from '@guideforge/collaboration';
import type { GuideCommand } from '@guideforge/commands';
import { GUIDE_COMMAND_TYPES } from '@guideforge/commands';
import type { AssetReference, ContentHash, EntityId } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { importMsGuide as msImport } from '@guideforge/interop-ms-guide';
import {
  createDraftPackageAsync,
  createReleasePackage,
  preflightZipArchive,
  verifyPackageStructureAsync,
  type PackageEntry,
} from '@guideforge/package-gforge';
import {
  OpfsAssetStore,
  openDb,
  persistWorkingDoc,
  type AiProposalRecord,
  type AssetMetaRecord,
  type EvidenceRecord,
  type GuideForgeDb,
  type YjsPersistenceHandle,
} from '@guideforge/storage-web';
import { strFromU8, unzipSync } from 'fflate';

export interface OpenGuideSession {
  guideId: string;
  working: WorkingGuide;
  persistence: YjsPersistenceHandle;
  db: GuideForgeDb;
  assets: OpfsAssetStore;
  title: string;
}

export interface LibraryEntry {
  guideId: string;
  title: string;
  lifecycleState: string;
  updatedAtIso: string;
  taskCount: number;
  stepCount: number;
}

let sharedDb: GuideForgeDb | null = null;
function db(): GuideForgeDb {
  sharedDb ??= openDb();
  return sharedDb;
}

function uuidv4(): EntityId {
  // crypto.randomUUID is available in modern browsers and jsdom/node 24.
  return crypto.randomUUID() as EntityId;
}

export async function listGuides(): Promise<LibraryEntry[]> {
  const rows = await db().guides.orderBy('updatedAtIso').reverse().toArray();
  return rows.map((r) => ({
    guideId: r.guideId,
    title: r.title,
    lifecycleState: r.lifecycleState,
    updatedAtIso: r.updatedAtIso,
    taskCount: r.taskCount,
    stepCount: r.stepCount,
  }));
}

export async function createGuide(title: string): Promise<OpenGuideSession> {
  const guideId = uuidv4();
  const working = createWorkingGuide(guideId, title);
  const persistence = persistWorkingDoc(working.doc, guideId);
  await persistence.synced;
  const assets = new OpfsAssetStore(db());
  await db().guides.put({
    guideId,
    title,
    description: '',
    lifecycleState: 'draft',
    createdAtIso: working.guide.get('createdAtIso') as string,
    updatedAtIso: working.guide.get('updatedAtIso') as string,
    taskCount: 0,
    stepCount: 0,
    docName: guideId,
  });
  return { guideId, working, persistence, db: db(), assets, title };
}

export async function openGuide(guideId: string): Promise<OpenGuideSession> {
  // Start from an EMPTY doc so persisted Yjs state (title, tasks) wins on
  // load; only seed defaults if the doc has no persisted data at all.
  const working = createEmptyWorkingGuide();
  const persistence = persistWorkingDoc(working.doc, guideId);
  await persistence.synced;
  seedEmptyWorkingGuide(working, guideId as EntityId, '');

  const meta = await db().guides.get(guideId);
  const snap = materializeSnapshot(working);
  // If we have no metadata yet (fresh open), backfill from the doc.
  if (!meta) {
    await db().guides.put({
      guideId,
      title: snap.title,
      description: snap.description,
      lifecycleState: snap.lifecycleState,
      createdAtIso: snap.createdAtIso,
      updatedAtIso: snap.updatedAtIso,
      taskCount: snap.tasks.length,
      stepCount: snap.tasks.reduce((n, t) => n + t.stepIds.length, 0),
      docName: guideId,
    });
  }
  const assets = new OpfsAssetStore(db());
  return { guideId, working, persistence, db: db(), assets, title: snap.title };
}

/** Apply a command, persist, and refresh Dexie metadata. */
export async function dispatchCommand(
  session: OpenGuideSession,
  command: GuideCommand,
): Promise<void> {
  applyCommandToWorkingGuide(session.working, command);
  const snap = materializeSnapshot(session.working);
  await session.db.guides.update(session.guideId, {
    title: snap.title,
    description: snap.description,
    lifecycleState: snap.lifecycleState,
    updatedAtIso: snap.updatedAtIso,
    taskCount: snap.tasks.length,
    stepCount: snap.tasks.reduce((n, t) => n + t.stepIds.length, 0),
  });
}

export async function renameGuide(session: OpenGuideSession, title: string): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: 'guide/set-title',
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { title },
  });
}

export async function addTask(session: OpenGuideSession, title: string): Promise<string> {
  const taskId = uuidv4();
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.addTask,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { taskId, title },
  });
  return taskId;
}

export async function addStep(
  session: OpenGuideSession,
  taskId: string,
  text: string,
): Promise<string> {
  const stepId = uuidv4();
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.addStep,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { taskId, stepId, title: text },
  });
  return stepId;
}

/** Add a measurable learning objective through the command bus (canonical). */
export async function addObjective(
  session: OpenGuideSession,
  input: {
    verb: string;
    target: string;
    conditions: string;
    criterion: string;
    stepIds: string[];
    citations: { sourceHash: string; regionId: string }[];
    criticality: 'core' | 'important' | 'supporting';
  },
): Promise<string> {
  const objectiveId = uuidv4();
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.addObjective,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { objectiveId, ...input },
  });
  return objectiveId;
}

/** Add a source-grounded assessment item through the command bus. */
export async function addAssessmentItem(
  session: OpenGuideSession,
  input: {
    objectiveId: string;
    prompt: string;
    interaction: 'single-choice' | 'multiple-response' | 'ordering' | 'numeric' | 'short-answer';
    options: { optionId: string; text: string }[];
    scoringRule: Record<string, unknown>;
    rationale: string;
    citations: { sourceHash: string; regionId: string }[];
    criticality: 'core' | 'important' | 'supporting';
  },
): Promise<string> {
  const itemId = uuidv4();
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.addAssessmentItem,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { itemId, ...input },
  });
  return itemId;
}

export async function removeStep(
  session: OpenGuideSession,
  taskId: string,
  stepId: string,
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.removeStep,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { taskId, stepId },
  });
}

export async function setStepText(
  session: OpenGuideSession,
  stepId: string,
  text: string,
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.setStepText,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { stepId, text },
  });
}

export async function addWarning(
  session: OpenGuideSession,
  stepId: string,
  severity: 'info' | 'warning' | 'critical',
  message: string,
): Promise<string> {
  const warningId = uuidv4();
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.addWarning,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { stepId, warningId, severity, message },
  });
  return warningId;
}

export async function removeWarning(
  session: OpenGuideSession,
  stepId: string,
  warningId: string,
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.removeWarning,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { stepId, warningId },
  });
}

export async function addTool(
  session: OpenGuideSession,
  stepId: string,
  name: string,
): Promise<string> {
  const toolId = uuidv4();
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.addTool,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { stepId, toolId, name },
  });
  return toolId;
}

export async function removeTool(
  session: OpenGuideSession,
  stepId: string,
  toolId: string,
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.removeTool,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { stepId, toolId },
  });
}

export async function addPart(
  session: OpenGuideSession,
  stepId: string,
  name: string,
  quantity: number,
): Promise<string> {
  const partId = uuidv4();
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.addPart,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { stepId, partId, name, quantity },
  });
  return partId;
}

export async function removePart(
  session: OpenGuideSession,
  stepId: string,
  partId: string,
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.removePart,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { stepId, partId },
  });
}

// ---------------------------------------------------------------------------
// Execution evidence (stored in Dexie; offline-first)
// ---------------------------------------------------------------------------

export interface EvidenceInput {
  guideId: string;
  stepId: string;
  kind: 'photo' | 'note' | 'signature' | 'measurement';
  value?: string;
  assetHash?: string;
  mimeType?: string;
}

export async function addEvidence(input: EvidenceInput): Promise<string> {
  const evidenceId = uuidv4();
  const record: EvidenceRecord = {
    evidenceId,
    guideId: input.guideId,
    stepId: input.stepId,
    kind: input.kind,
    capturedAtIso: new Date().toISOString(),
    actorId: 'local-user',
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(input.assetHash !== undefined ? { assetHash: input.assetHash } : {}),
    ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
  };
  await db().evidence.put(record);
  return evidenceId;
}

export async function listEvidence(guideId: string): Promise<EvidenceRecord[]> {
  return db().evidence.where('guideId').equals(guideId).reverse().sortBy('capturedAtIso');
}

// ---------------------------------------------------------------------------
// Fake AI proposals (Phase 03: human-reviewable, applied via commands)
// ---------------------------------------------------------------------------

export interface NewProposal {
  guideId: string;
  commandType: string;
  payload: Record<string, unknown>;
  summary: string;
  confidence: number;
  sourceHash: string | null;
  /** Source regions cited by this proposal. */
  citations?: { regionId: string; pageIndex: number; excerptHash: string; claimRef: string }[];
  /** Provider/receipt provenance from the generation run. */
  receipt?: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    promptVersion: string;
    schemaVersion: string;
    requestId: string;
    createdAtIso: string;
  };
}

export async function createProposal(input: NewProposal): Promise<string> {
  const proposalId = uuidv4();
  await db().proposals.put({
    proposalId,
    guideId: input.guideId,
    commandType: input.commandType,
    payload: input.payload,
    summary: input.summary,
    confidence: input.confidence,
    sourceHash: input.sourceHash,
    citations: input.citations ?? [],
    receipt: input.receipt ?? {
      provider: 'unknown',
      model: '',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      promptVersion: '',
      schemaVersion: '',
      requestId: '',
      createdAtIso: new Date().toISOString(),
    },
    createdAtIso: new Date().toISOString(),
    status: 'pending',
  });
  return proposalId;
}

export async function listProposals(guideId: string): Promise<AiProposalRecord[]> {
  return db().proposals.where('guideId').equals(guideId).reverse().sortBy('createdAtIso');
}

/** Accept a proposal by executing its command through the normal command bus. */
export async function acceptProposal(session: OpenGuideSession, proposalId: string): Promise<void> {
  const proposal = await db().proposals.get(proposalId);
  if (proposal?.status !== 'pending') return;
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: proposal.commandType,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'ai-proposal-accept',
    occurredAt: new Date().toISOString(),
    payload: proposal.payload,
  });
  await db().proposals.update(proposalId, { status: 'accepted' });
}

export async function rejectProposal(proposalId: string): Promise<void> {
  await db().proposals.update(proposalId, { status: 'rejected' });
}

/** Generate AI proposals for a guide (reviewable, never auto-applied). */
export async function generateFakeProposals(session: OpenGuideSession): Promise<number> {
  const snap = materializeSnapshot(session.working);
  const { generateGatewayProposals } = await import('./aiProposals');
  const result = await generateGatewayProposals(snap);
  return result.created;
}

export async function closeGuide(session: OpenGuideSession): Promise<void> {
  // Await destroy so pending Yjs updates flush to IndexedDB (survives restart).
  await session.persistence.provider.destroy();
  session.working.doc.destroy();
}

/** Export a deterministic draft `.gforge` package (WebCrypto hashing). */
export async function exportDraft(
  session: OpenGuideSession,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const snapshot = materializeSnapshot(session.working);
  const assets = await collectReferencedAssets(session, snapshot);
  // Attribution report for every packaged asset (Phase 04).
  const attributions = new Map<
    string,
    { name: string; licenseId?: string; attribution?: string; source?: string }
  >();
  for (const hash of assets.keys()) {
    const meta = (await session.db.assets.get(hash)) as
      | (AssetMetaRecord & {
          name?: string;
          origin?: { kind: string; licenseId?: string; attribution?: string; record?: string };
        })
      | undefined;
    if (meta) {
      const attribution: {
        name: string;
        licenseId?: string;
        attribution?: string;
        source?: string;
      } = {
        name: meta.name ?? hash.slice(0, 10),
      };
      if (meta.origin?.licenseId) attribution.licenseId = meta.origin.licenseId;
      if (meta.origin?.attribution) attribution.attribution = meta.origin.attribution;
      if (meta.origin?.record) attribution.source = meta.origin.record;
      attributions.set(hash, attribution);
    }
  }
  const { bytes } = await createDraftPackageAsync({
    snapshot,
    assets,
    attributions: attributions as Map<
      ContentHash,
      { name: string; licenseId?: string; attribution?: string; source?: string }
    >,
  });
  return { bytes, filename: `${snapshot.title.replace(/[^a-z0-9-_]+/gi, '-')}.gforge` };
}

/**
 * Collect every asset referenced by the snapshot (step media + scene node
 * asset hashes) from the content-addressed store, keyed by SHA-256. Packages
 * must never be exported with an empty asset map (Phase 02 gate).
 */
async function collectReferencedAssets(
  session: OpenGuideSession,
  snapshot: GuideSnapshot,
): Promise<Map<ContentHash, AssetReference & { bytes: Uint8Array }>> {
  const assets = new Map<ContentHash, AssetReference & { bytes: Uint8Array }>();
  const hashes = new Set<string>();

  for (const step of snapshot.steps) {
    for (const media of step.media) hashes.add(media.assetHash);
  }
  for (const node of snapshot.scene.nodes) {
    if (node.assetHash) hashes.add(node.assetHash);
  }

  for (const hash of hashes) {
    const bytes = await session.assets.get(hash as ContentHash);
    if (!bytes) continue; // missing assets are reported by validateReferencedAssets
    const meta = await session.db.assets.get(hash);
    const extension =
      meta?.mimeType === 'model/gltf-binary'
        ? 'glb'
        : meta?.mimeType?.startsWith('image/')
          ? (meta.mimeType.split('/')[1] ?? 'bin')
          : meta?.mimeType?.startsWith('video/')
            ? (meta.mimeType.split('/')[1] ?? 'bin')
            : 'bin';
    assets.set(hash as ContentHash, {
      bytes,
      hash: hash as ContentHash,
      mimeType: meta?.mimeType ?? 'application/octet-stream',
      extension,
      sizeBytes: bytes.length,
    });
  }
  return assets;
}

/**
 * Validate that every asset referenced by the snapshot exists in the store.
 * Returns missing hashes (export must not silently drop referenced assets).
 */
export async function validateReferencedAssets(
  session: OpenGuideSession,
): Promise<{ missing: string[] }> {
  const snapshot = materializeSnapshot(session.working);
  const missing: string[] = [];
  const hashes = new Set<string>();
  for (const step of snapshot.steps) for (const media of step.media) hashes.add(media.assetHash);
  for (const node of snapshot.scene.nodes) if (node.assetHash) hashes.add(node.assetHash);
  for (const hash of hashes) {
    if (!(await session.assets.has(hash as ContentHash))) missing.push(hash);
  }
  return { missing };
}

/** Import a draft `.gforge` package into the library. */
export async function importDraft(bytes: Uint8Array): Promise<{ guideId: string; title: string }> {
  const entries = extractZipEntries(bytes);
  const manifest = await verifyPackageStructureAsync(entries);
  const guideEntry = entries.find((e) => e.path === 'guide.json');
  if (!guideEntry) throw new Error('import: missing guide.json');
  const snapshot = JSON.parse(strFromU8(guideEntry.data)) as GuideSnapshot;

  const guideId = manifest.guideId || snapshot.guideId;
  const working = createWorkingGuide(guideId as EntityId, snapshot.title);
  hydrateWorkingGuide(working, snapshot);
  const persistence = persistWorkingDoc(working.doc, guideId);
  await persistence.synced;

  // Restore packaged asset bytes into the content-addressed store so scene
  // models/media referenced by the snapshot resolve after import.
  const store = new OpfsAssetStore(db());
  for (const entry of entries) {
    const m = /^assets\/([0-9a-f]{64})\.([a-z0-9]+)$/.exec(entry.path);
    if (!m) continue;
    const hash = m[1] as ContentHash;
    if (!(await store.has(hash))) {
      const mimeType =
        m[2] === 'glb'
          ? 'model/gltf-binary'
          : m[2] === 'png' || m[2] === 'jpg' || m[2] === 'webp'
            ? `image/${m[2]}`
            : 'application/octet-stream';
      await store.put(entry.data, mimeType, m[2]!);
    }
  }

  await db().guides.put({
    guideId,
    title: snapshot.title,
    description: snapshot.description,
    lifecycleState: snapshot.lifecycleState,
    createdAtIso: snapshot.createdAtIso,
    updatedAtIso: snapshot.updatedAtIso,
    taskCount: snapshot.tasks.length,
    stepCount: snapshot.tasks.reduce((n, t) => n + t.stepIds.length, 0),
    docName: guideId,
  });
  // Await destroy so pending Yjs updates flush to IndexedDB before the caller
  // reopens the guide.
  await persistence.provider.destroy();
  working.doc.destroy();
  return { guideId, title: snapshot.title };
}

/** Extract and validate zip entries (bounds-checked preflight before inflation). */
function extractZipEntries(bytes: Uint8Array): PackageEntry[] {
  if (bytes.length > 512 * 1024 * 1024) throw new Error('import: package too large');
  // Bounded preflight of the central directory (metadata only) so hostile
  // archives are rejected before any decompression allocates memory.
  preflightZipArchive(bytes);
  const unzipped = unzipSync(bytes);
  const entries: PackageEntry[] = [];
  for (const [path, data] of Object.entries(unzipped)) {
    entries.push({ path, data });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Personal release export + Microsoft .guide import
// ---------------------------------------------------------------------------

/**
 * Export a personal release `.gforge`. The browser NEVER holds a signing key
 * (localStorage demo keys were an audit finding); personal releases are
 * unsigned and clearly marked. Signed releases belong to the companion key
 * store / OS secure store (Phase 07+).
 */
export async function exportPersonalRelease(
  session: OpenGuideSession,
  releaseVersion: string,
): Promise<{ bytes: Uint8Array; filename: string; unsigned: true }> {
  const snapshot = materializeSnapshot(session.working);
  const assets = await collectReferencedAssets(session, snapshot);
  const bytes = createReleasePackage({
    snapshot,
    assets,
    release: {
      releaseId: crypto.randomUUID(),
      releaseVersion,
      createdAt: new Date().toISOString(),
      guideId: session.guideId,
    },
  });
  return {
    bytes,
    filename: `${snapshot.title.replace(/[^a-z0-9-_]+/gi, '-')}-${releaseVersion}.gforge`,
    unsigned: true,
  };
}

/** Import a Microsoft `.guide` package into the library. */
export async function importMsGuidePackage(
  bytes: Uint8Array,
  filename: string,
): Promise<{ guideId: string; warnings: string[] }> {
  const imported = msImport(bytes, filename);
  const working = createEmptyWorkingGuide();
  const persistence = persistWorkingDoc(working.doc, imported.snapshot.guideId);
  await persistence.synced;
  seedEmptyWorkingGuide(working, imported.snapshot.guideId, imported.snapshot.title);
  hydrateWorkingGuide(working, imported.snapshot);

  await db().guides.put({
    guideId: imported.snapshot.guideId,
    title: imported.snapshot.title,
    description: imported.snapshot.description,
    lifecycleState: imported.snapshot.lifecycleState,
    createdAtIso: imported.snapshot.createdAtIso,
    updatedAtIso: imported.snapshot.updatedAtIso,
    taskCount: imported.snapshot.tasks.length,
    stepCount: imported.snapshot.steps.length,
    docName: imported.snapshot.guideId,
  });
  await persistence.provider.destroy();
  working.doc.destroy();
  return { guideId: imported.snapshot.guideId, warnings: imported.report.warnings };
}
