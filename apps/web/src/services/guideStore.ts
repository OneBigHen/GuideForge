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
import type { EntityId } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import {
  createDraftPackageAsync,
  verifyPackageStructureAsync,
  type PackageEntry,
} from '@guideforge/package-gforge';
import {
  OpfsAssetStore,
  openDb,
  persistWorkingDoc,
  type AiProposalRecord,
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
  // Draft package: assets not yet materialized into the doc, so pass an empty
  // asset map unless assets were registered this session.
  const { bytes } = await createDraftPackageAsync({ snapshot, assets: new Map() });
  return { bytes, filename: `${snapshot.title.replace(/[^a-z0-9-_]+/gi, '-')}.gforge` };
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

/** Extract and validate zip entries (bounds-checked). */
function extractZipEntries(bytes: Uint8Array): PackageEntry[] {
  if (bytes.length > 512 * 1024 * 1024) throw new Error('import: package too large');
  const unzipped = unzipSync(bytes);
  const entries: PackageEntry[] = [];
  for (const [path, data] of Object.entries(unzipped)) {
    entries.push({ path, data });
  }
  return entries;
}
