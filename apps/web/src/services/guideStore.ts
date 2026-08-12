/**
 * Browser guide store — orchestrates the local-first stack for apps/web:
 *
 *   - Yjs working document (packages/collaboration)
 *   - y-indexeddb persistence + Dexie metadata + OPFS assets (storage-web)
 *   - deterministic draft package export/import (package-gforge)
 *
 * Every mutation goes through typed commands.
 */
import { sanitizePhoto, type PhotoMimeType } from '@guideforge/assets';
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
import {
  answerTrainingItem,
  beginRuntimeStep,
  beginTrainingRetest,
  buildRuntimeCompletionReport,
  completeRuntimeStep,
  createRuntimeCompletionRule,
  createRuntimeSession,
  isGuideSnapshot,
  isRuntimeSession,
  migrateToCurrent,
  recordRuntimeEvidence,
  startTrainingSession,
  submitTrainingAttempt,
  type GuideSnapshot,
  type RuntimeAttestation,
  type RuntimeSession,
  type TrainingAttemptResult,
  type TrainingResponse,
  type TrainingSession,
  type TrainingState,
} from '@guideforge/guide-schema';
import { importMsGuide as msImport } from '@guideforge/interop-ms-guide';
import {
  canonicalJson,
  createDraftPackageAsync,
  createReleasePackage,
  extractZipArchive,
  sanitizePackageMetadata,
  verifyPackageStructureAsync,
  webSha256,
  type PackageBinary,
} from '@guideforge/package-gforge';
import {
  loadSourceBytes,
  migrateDexieSourcesToCanonical,
  openDb,
  OpfsAssetStore,
  persistWorkingDoc,
  storeSourceBytes,
  type AiProposalRecord,
  type AssetMetaRecord,
  type EvidenceRecord,
  type GuideForgeDb,
  type StorageHealth,
  type YjsPersistenceHandle,
} from '@guideforge/storage-web';
import { strFromU8 } from 'fflate';

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

export async function getStorageHealth(): Promise<StorageHealth> {
  return new OpfsAssetStore(db()).status();
}

export async function requestStoragePersistence(): Promise<boolean> {
  return new OpfsAssetStore(db()).requestPersistence();
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
  let snap = materializeSnapshot(working);
  if (snap.sources.length === 0) {
    const legacySources = await migrateDexieSourcesToCanonical(db(), guideId);
    if (legacySources.length > 0) {
      hydrateWorkingGuide(working, { ...snap, sources: legacySources });
      snap = materializeSnapshot(working);
    }
  }
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

/** Replace the canonical training graph through the collaborative command bus. */
export async function replaceTrainingProgram(
  session: OpenGuideSession,
  training: TrainingState,
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.replaceTraining,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { training },
  });
}

export async function updateTrainingObjective(
  session: OpenGuideSession,
  objectiveId: string,
  patch: { verb?: string; target?: string; conditions?: string; criterion?: string },
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.updateTrainingObjective,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { objectiveId, ...patch },
  });
}

export async function updateAssessmentItem(
  session: OpenGuideSession,
  itemId: string,
  patch: {
    prompt?: string;
    rationale?: string;
    feedback?: { correct: string; incorrect: string };
  },
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.updateAssessmentItem,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { itemId, ...patch },
  });
}

export async function reviewAssessmentItem(
  session: OpenGuideSession,
  itemId: string,
  reviewState: 'draft' | 'reviewed',
): Promise<void> {
  await dispatchCommand(session, {
    commandId: crypto.randomUUID(),
    commandType: GUIDE_COMMAND_TYPES.reviewAssessmentItem,
    actorId: 'local-user',
    guideId: session.guideId as EntityId,
    origin: 'user',
    occurredAt: new Date().toISOString(),
    payload: { itemId, reviewState },
  });
}

// ---------------------------------------------------------------------------
// Offline training runtime (attempts are local records, not canonical edits)
// ---------------------------------------------------------------------------

export async function loadTrainingSession(
  guideSession: OpenGuideSession,
  learnerId = 'local-user',
): Promise<TrainingSession> {
  const existing = await guideSession.db.trainingSessions
    .where('guideId')
    .equals(guideSession.guideId)
    .filter((record) => record.learnerId === learnerId)
    .first();
  if (existing) return existing;
  const snapshot = materializeSnapshot(guideSession.working);
  const runtime = startTrainingSession(snapshot.training, guideSession.guideId, learnerId);
  await guideSession.db.trainingSessions.put(runtime);
  return runtime;
}

export async function saveTrainingSession(
  guideSession: OpenGuideSession,
  runtime: TrainingSession,
): Promise<void> {
  await guideSession.db.transaction('rw', guideSession.db.trainingSessions, async () => {
    await guideSession.db.trainingSessions.put(runtime);
  });
}

export async function recordTrainingAnswer(
  guideSession: OpenGuideSession,
  runtime: TrainingSession,
  itemId: string,
  response: TrainingResponse,
): Promise<TrainingSession> {
  const next = answerTrainingItem(runtime, itemId as TrainingSession['itemIds'][number], response);
  await saveTrainingSession(guideSession, next);
  return next;
}

export async function submitOfflineTrainingAttempt(
  guideSession: OpenGuideSession,
  runtime: TrainingSession,
): Promise<TrainingAttemptResult> {
  const snapshot = materializeSnapshot(guideSession.working);
  const result = submitTrainingAttempt(snapshot.training, runtime);
  await saveTrainingSession(guideSession, result.session);
  return result;
}

export async function startOfflineTrainingRetest(
  guideSession: OpenGuideSession,
  runtime: TrainingSession,
): Promise<TrainingSession> {
  const snapshot = materializeSnapshot(guideSession.working);
  const next = beginTrainingRetest(snapshot.training, runtime);
  await saveTrainingSession(guideSession, next);
  return next;
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
  measurement?: EvidenceRecord['measurement'];
  attestation?: EvidenceRecord['attestation'];
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
    ...(input.measurement !== undefined ? { measurement: input.measurement } : {}),
    ...(input.attestation !== undefined ? { attestation: input.attestation } : {}),
  };
  await db().evidence.put(record);
  return evidenceId;
}

export async function listEvidence(guideId: string): Promise<EvidenceRecord[]> {
  return db().evidence.where('guideId').equals(guideId).reverse().sortBy('capturedAtIso');
}

const EVIDENCE_KINDS = new Set<EvidenceRecord['kind']>([
  'photo',
  'note',
  'signature',
  'measurement',
]);

function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.evidenceId === 'string' &&
    typeof record.guideId === 'string' &&
    typeof record.stepId === 'string' &&
    typeof record.kind === 'string' &&
    EVIDENCE_KINDS.has(record.kind as EvidenceRecord['kind']) &&
    typeof record.capturedAtIso === 'string' &&
    typeof record.actorId === 'string' &&
    (record.value === undefined || typeof record.value === 'string') &&
    (record.assetHash === undefined ||
      (typeof record.assetHash === 'string' && /^[0-9a-f]{64}$/.test(record.assetHash))) &&
    (record.mimeType === undefined || typeof record.mimeType === 'string') &&
    (record.measurement === undefined || isRuntimeMeasurement(record.measurement)) &&
    (record.attestation === undefined || isRuntimeAttestation(record.attestation))
  );
}

function isRuntimeMeasurement(value: unknown): value is NonNullable<EvidenceRecord['measurement']> {
  if (!value || typeof value !== 'object') return false;
  const measurement = value as Record<string, unknown>;
  return (
    typeof measurement.label === 'string' &&
    typeof measurement.value === 'number' &&
    Number.isFinite(measurement.value) &&
    typeof measurement.unit === 'string' &&
    measurement.unit.length > 0
  );
}

function isRuntimeAttestation(value: unknown): value is RuntimeAttestation {
  if (!value || typeof value !== 'object') return false;
  const attestation = value as Record<string, unknown>;
  return (
    attestation.algorithm === 'ECDSA-P256-SHA256' &&
    typeof attestation.signerId === 'string' &&
    typeof attestation.payloadHash === 'string' &&
    /^[0-9a-f]{64}$/.test(attestation.payloadHash) &&
    typeof attestation.publicKeyJwk === 'object' &&
    attestation.publicKeyJwk !== null &&
    typeof attestation.signatureHex === 'string' &&
    /^[0-9a-f]+$/.test(attestation.signatureHex)
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function flattenStepIds(snapshot: GuideSnapshot): string[] {
  return snapshot.tasks.flatMap((task) => task.stepIds);
}

async function persistRuntimeSession(
  session: OpenGuideSession,
  runtime: RuntimeSession,
): Promise<void> {
  await session.db.runtimeSessions.put(runtime);
  await session.db.runtimeBlobs.put({
    id: `${session.guideId}:session-${runtime.sessionId}`,
    guideId: session.guideId,
    path: `session-${runtime.sessionId}`,
    bytes: canonicalJson(runtime),
    mimeType: 'application/json',
    extension: 'json',
  });
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
  if (current && JSON.stringify(current.stepIds) === JSON.stringify(stepIds)) return current;
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
  const evidenceId = await addEvidence(input);
  const nowIso = new Date().toISOString();
  const active = beginRuntimeStep(runtime, input.stepId, uuidv4(), nowIso);
  const next = recordRuntimeEvidence(active, input.stepId, evidenceId, nowIso);
  await persistRuntimeSession(session, next);
  return { evidenceId, runtime: next };
}

export async function recordRuntimeNote(
  session: OpenGuideSession,
  runtime: RuntimeSession,
  stepId: string,
  note: string,
): Promise<{ evidenceId: string; runtime: RuntimeSession }> {
  const value = note.trim();
  if (!value) throw new Error('note cannot be empty');
  return addRuntimeEvidence(session, runtime, {
    guideId: session.guideId,
    stepId,
    kind: 'note',
    value,
  });
}

export async function recordRuntimeMeasurement(
  session: OpenGuideSession,
  runtime: RuntimeSession,
  input: { stepId: string; label: string; value: number; unit: string },
): Promise<{ evidenceId: string; runtime: RuntimeSession }> {
  if (!Number.isFinite(input.value) || !input.label.trim() || !input.unit.trim()) {
    throw new Error('measurement requires a finite value, label, and unit');
  }
  return addRuntimeEvidence(session, runtime, {
    guideId: session.guideId,
    stepId: input.stepId,
    kind: 'measurement',
    value: `${input.label.trim()}: ${input.value} ${input.unit.trim()}`,
    measurement: {
      label: input.label.trim(),
      value: input.value,
      unit: input.unit.trim(),
    },
  });
}

export async function captureRuntimePhoto(
  session: OpenGuideSession,
  runtime: RuntimeSession,
  stepId: string,
  file: File,
): Promise<{ evidenceId: string; runtime: RuntimeSession; assetHash: string }> {
  const mimeType = file.type as PhotoMimeType;
  const sanitized = sanitizePhoto(new Uint8Array(await file.arrayBuffer()), mimeType);
  const extension =
    sanitized.mimeType === 'image/jpeg' ? 'jpg' : (sanitized.mimeType.split('/')[1] ?? 'bin');
  const meta = await session.assets.put(sanitized.bytes, sanitized.mimeType, extension);
  const result = await addRuntimeEvidence(session, runtime, {
    guideId: session.guideId,
    stepId,
    kind: 'photo',
    assetHash: meta.hash,
    mimeType: sanitized.mimeType,
    value: `${sanitized.width} × ${sanitized.height}px; metadata stripped: ${sanitized.metadataRemoved ? 'yes' : 'no'}`,
  });
  return { ...result, assetHash: meta.hash };
}

export async function createRuntimeAttestation(
  session: OpenGuideSession,
  runtime: RuntimeSession,
  stepId: string,
): Promise<{ evidenceId: string; runtime: RuntimeSession; assetHash: string }> {
  const capturedAtIso = new Date().toISOString();
  const payloadBytes = canonicalJson({
    type: 'guideforge-procedure-attestation',
    sessionId: runtime.sessionId,
    guideId: session.guideId,
    stepId,
    signerId: 'local-user',
    capturedAtIso,
  });
  const payloadHash = await webSha256(payloadBytes);
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    payloadBytes as BufferSource,
  );
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.publicKey,
    signature,
    payloadBytes as BufferSource,
  );
  if (!verified) throw new Error('local attestation signature verification failed');
  const attestation: RuntimeAttestation = {
    algorithm: 'ECDSA-P256-SHA256',
    signerId: 'local-user',
    payloadHash,
    publicKeyJwk: publicKeyJwk as Record<string, unknown>,
    signatureHex: bytesToHex(new Uint8Array(signature)),
  };
  const artifactBytes = canonicalJson({
    ...attestation,
    payload: new TextDecoder().decode(payloadBytes),
  });
  const meta = await session.assets.put(artifactBytes, 'application/json', 'json');
  const result = await addRuntimeEvidence(session, runtime, {
    guideId: session.guideId,
    stepId,
    kind: 'signature',
    value: 'Local device attestation',
    assetHash: meta.hash,
    mimeType: 'application/json',
    attestation,
  });
  return { ...result, assetHash: meta.hash };
}

export async function completeRuntimeStepForGuide(
  session: OpenGuideSession,
  runtime: RuntimeSession,
  stepId: string,
): Promise<RuntimeSession> {
  const snapshot = materializeSnapshot(session.working);
  const step = snapshot.steps.find((candidate) => candidate.stepId === stepId);
  if (!step) throw new Error(`unknown guide step: ${stepId}`);
  const active = beginRuntimeStep(runtime, stepId, uuidv4(), new Date().toISOString());
  const evidence = (await listEvidence(session.guideId)).filter(
    (record) => record.stepId === stepId,
  );
  const next = completeRuntimeStep({
    session: active,
    stepId,
    completionId: uuidv4(),
    completedBy: 'local-user',
    evidence: evidence.map((record) => ({ evidenceId: record.evidenceId, kind: record.kind })),
    rule: createRuntimeCompletionRule(step.verification.length),
    nowIso: new Date().toISOString(),
  });
  await persistRuntimeSession(session, next);
  return next;
}

export async function exportRuntimeCompletionReport(
  session: OpenGuideSession,
  runtime: RuntimeSession,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const snapshot = materializeSnapshot(session.working);
  const evidence = await listEvidence(session.guideId);
  const stepTitles = Object.fromEntries(
    snapshot.steps.map((step) => [step.stepId, step.instructionText]),
  );
  const report = buildRuntimeCompletionReport({
    session: runtime,
    stepTitles,
    evidence: evidence.map((record) => ({
      evidenceId: record.evidenceId,
      stepId: record.stepId,
      kind: record.kind,
      capturedAtIso: record.capturedAtIso,
      ...(record.value !== undefined ? { value: record.value } : {}),
      ...(record.assetHash !== undefined ? { assetHash: record.assetHash } : {}),
      ...(record.mimeType !== undefined ? { mimeType: record.mimeType } : {}),
      ...(record.measurement !== undefined ? { measurement: record.measurement } : {}),
      ...(record.attestation !== undefined ? { attestation: record.attestation } : {}),
    })),
    exportedAtIso: new Date().toISOString(),
  });
  await session.db.reports.put({
    id: `${session.guideId}:reports/runtime-completion-${runtime.sessionId}.json`,
    guideId: session.guideId,
    path: `reports/runtime-completion-${runtime.sessionId}.json`,
    report,
  });
  return {
    bytes: canonicalJson(report),
    filename: `${snapshot.title.replace(/[^a-z0-9-_]+/gi, '-')}-completion.json`,
  };
}

function referencedAssetHashes(
  snapshot: GuideSnapshot,
  evidence: readonly EvidenceRecord[] = [],
): Set<string> {
  const hashes = new Set<string>();
  for (const step of snapshot.steps) for (const media of step.media) hashes.add(media.assetHash);
  for (const node of snapshot.scene.nodes) if (node.assetHash) hashes.add(node.assetHash);
  for (const record of evidence) if (record.assetHash) hashes.add(record.assetHash);
  return hashes;
}

function assetMimeAndExtension(meta: AssetMetaRecord | undefined): {
  mimeType: string;
  extension: string;
} {
  const mimeType = meta?.mimeType ?? 'application/octet-stream';
  const extension =
    mimeType === 'model/gltf-binary'
      ? 'glb'
      : mimeType.startsWith('image/')
        ? (mimeType.split('/')[1] ?? 'bin')
        : mimeType.startsWith('video/')
          ? (mimeType.split('/')[1] ?? 'bin')
          : 'bin';
  return { mimeType, extension };
}

async function collectAttributions(
  session: OpenGuideSession,
  assets: ReadonlyMap<ContentHash, AssetReference & { bytes: Uint8Array }>,
): Promise<
  Map<ContentHash, { name: string; licenseId?: string; attribution?: string; source?: string }>
> {
  const attributions = new Map<
    ContentHash,
    { name: string; licenseId?: string; attribution?: string; source?: string }
  >();
  for (const hash of assets.keys()) {
    const meta = (await session.db.assets.get(hash)) as
      | (AssetMetaRecord & {
          name?: string;
          origin?: { kind: string; licenseId?: string; attribution?: string; record?: string };
        })
      | undefined;
    if (!meta) continue;
    attributions.set(hash, {
      name: meta.name ?? hash.slice(0, 10),
      ...(meta.origin?.licenseId ? { licenseId: meta.origin.licenseId } : {}),
      ...(meta.origin?.attribution ? { attribution: meta.origin.attribution } : {}),
      ...(meta.origin?.record ? { source: meta.origin.record } : {}),
    });
  }
  return attributions;
}

async function collectSourceBytes(
  session: OpenGuideSession,
  snapshot: GuideSnapshot,
): Promise<Map<ContentHash, PackageBinary>> {
  const sourceBytes = new Map<ContentHash, PackageBinary>();
  for (const source of snapshot.sources) {
    const bytes =
      (await loadSourceBytes(session.db, source.sha256)) ??
      (await session.assets.get(source.sha256));
    if (!bytes) continue;
    const extensionCandidate = source.originalName.split('.').pop()?.toLowerCase() ?? 'bin';
    const extension = /^[a-z0-9]{1,16}$/.test(extensionCandidate) ? extensionCandidate : 'bin';
    sourceBytes.set(source.sha256, {
      bytes,
      extension,
      mimeType: source.mediaType,
    });
  }
  return sourceBytes;
}

async function readStoredBytes(value: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (typeof value === 'object' && value !== null && 'length' in value) {
    return Uint8Array.from(value as unknown as ArrayLike<number>);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(await value.arrayBuffer());
}

async function collectRuntimeFiles(session: OpenGuideSession): Promise<Map<string, PackageBinary>> {
  const files = new Map<string, PackageBinary>();
  for (const row of await session.db.runtimeBlobs
    .where('guideId')
    .equals(session.guideId)
    .toArray()) {
    files.set(row.path, {
      bytes: await readStoredBytes(row.bytes),
      extension: row.extension,
      mimeType: row.mimeType,
    });
  }
  return files;
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
  citations?: {
    regionId: string;
    sourceHash?: string;
    pageIndex: number;
    excerptHash: string;
    claimRef: string;
  }[];
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
  const validation = await validateReferencedAssets(session);
  if (validation.missing.length > 0) {
    throw new Error(`export: missing referenced assets: ${validation.missing.join(', ')}`);
  }
  const assets = await collectReferencedAssets(session, snapshot);
  const attributions = await collectAttributions(session, assets);
  const { bytes } = await createDraftPackageAsync({
    snapshot,
    assets,
    sourceBytes: await collectSourceBytes(session, snapshot),
    attributions,
  });
  return { bytes, filename: `${snapshot.title.replace(/[^a-z0-9-_]+/gi, '-')}.gforge` };
}

/** Export every restorable project artifact, including execution evidence. */
export async function exportFullBackup(
  session: OpenGuideSession,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const snapshot = materializeSnapshot(session.working);
  const evidence = await session.db.evidence.where('guideId').equals(session.guideId).toArray();
  const runtimeReports = await session.db.reports
    .where('guideId')
    .equals(session.guideId)
    .filter((row) => row.path.startsWith('reports/runtime-completion-'))
    .toArray();
  const validation = await validateReferencedAssets(session, evidence);
  if (validation.missing.length > 0) {
    throw new Error(`backup: missing referenced assets: ${validation.missing.join(', ')}`);
  }
  const assets = await collectReferencedAssets(session, snapshot, evidence);
  const sourceBytes = await collectSourceBytes(session, snapshot);
  const assetBytes = Array.from(assets.values()).reduce(
    (total, asset) => total + asset.bytes.length,
    0,
  );
  const sourceByteCount = Array.from(sourceBytes.values()).reduce(
    (total, source) => total + source.bytes.length,
    0,
  );
  const { bytes } = await createDraftPackageAsync({
    snapshot,
    assets,
    packageType: 'backup',
    sourceBytes,
    reports: {
      generation: { runs: snapshot.generationRuns },
      validation: {
        missingAssets: [],
        assetCount: assets.size,
        sourceCount: snapshot.sources.length,
      },
      cost: { assetBytes, sourceBytes: sourceByteCount, evidenceCount: evidence.length },
      ...Object.fromEntries(
        runtimeReports.map((row) => [
          row.path.slice('reports/'.length).replace(/\.json$/, ''),
          row.report,
        ]),
      ),
    },
    runtime: {
      includeEvidence: true,
      evidenceRecords: evidence,
      files: await collectRuntimeFiles(session),
    },
    attributions: await collectAttributions(session, assets),
  });
  return {
    bytes,
    filename: `${snapshot.title.replace(/[^a-z0-9-_]+/gi, '-')}-backup.gforge`,
  };
}

/**
 * Collect every asset referenced by the snapshot (step media + scene node
 * asset hashes) from the content-addressed store, keyed by SHA-256. Packages
 * must never be exported with an empty asset map (Phase 02 gate).
 */
async function collectReferencedAssets(
  session: OpenGuideSession,
  snapshot: GuideSnapshot,
  evidence: readonly EvidenceRecord[] = [],
): Promise<Map<ContentHash, AssetReference & { bytes: Uint8Array }>> {
  const assets = new Map<ContentHash, AssetReference & { bytes: Uint8Array }>();
  const hashes = referencedAssetHashes(snapshot, evidence);

  for (const hash of hashes) {
    const bytes = await session.assets.get(hash as ContentHash);
    if (!bytes) throw new Error(`asset bytes unavailable: ${hash}`);
    const meta = await session.db.assets.get(hash);
    const { mimeType, extension } = assetMimeAndExtension(meta);
    assets.set(hash as ContentHash, {
      bytes,
      hash: hash as ContentHash,
      mimeType,
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
  evidence: readonly EvidenceRecord[] = [],
): Promise<{ missing: string[] }> {
  const snapshot = materializeSnapshot(session.working);
  const missing: string[] = [];
  const hashes = referencedAssetHashes(snapshot, evidence);
  for (const hash of hashes) {
    if (!(await session.assets.get(hash as ContentHash))) missing.push(hash);
  }
  return { missing };
}

export interface ImportDraftResult {
  guideId: string;
  title: string;
  warnings: string[];
}

function parsePackageJson(bytes: Uint8Array, label: string): unknown {
  try {
    return sanitizePackageMetadata(JSON.parse(strFromU8(bytes)));
  } catch (error) {
    throw new Error(
      `import: invalid ${label}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function packageAssetMimeType(extension: string): string {
  return extension === 'glb'
    ? 'model/gltf-binary'
    : extension === 'png' || extension === 'jpg' || extension === 'webp'
      ? `image/${extension}`
      : extension === 'mp4' || extension === 'webm'
        ? `video/${extension}`
        : 'application/octet-stream';
}

/** Import a draft or full-backup `.gforge` package into the library. */
export async function importDraft(bytes: Uint8Array): Promise<ImportDraftResult> {
  const entries = await extractZipArchive(bytes);
  const manifest = await verifyPackageStructureAsync(entries);
  const entryMap = new Map(entries.map((entry) => [entry.path, entry]));
  const guideEntry = entryMap.get('guide.json');
  if (!guideEntry) throw new Error('import: missing guide.json');
  const migrated = migrateToCurrent(parsePackageJson(guideEntry.data, 'guide.json'));
  if (!isGuideSnapshot(migrated)) throw new Error('import: invalid GuideSnapshot');
  const snapshot: GuideSnapshot = migrated;
  if (manifest.guideId !== snapshot.guideId) {
    throw new Error('import: manifest guideId does not match guide.json');
  }

  const warnings: string[] = [];
  if (manifest.version === 1) warnings.push('legacy package manifest v1 migrated during restore');

  const evidence: EvidenceRecord[] = [];
  const runtimeIndexPath = manifest.runtime?.evidenceIndexPath ?? 'runtime/evidence/index.json';
  const runtimeIndex = entryMap.get(runtimeIndexPath);
  if (manifest.runtime?.evidenceIncluded) {
    if (!runtimeIndex) throw new Error('import: manifest requires missing evidence index');
    const rawEvidence = parsePackageJson(runtimeIndex.data, runtimeIndexPath);
    if (!Array.isArray(rawEvidence) || !rawEvidence.every(isEvidenceRecord)) {
      throw new Error('import: invalid runtime evidence index');
    }
    for (const record of rawEvidence) {
      if (record.guideId !== snapshot.guideId) {
        throw new Error(`import: evidence guideId mismatch for ${record.evidenceId}`);
      }
      evidence.push(record);
    }
  } else if (runtimeIndex) {
    throw new Error('import: runtime evidence present without inclusion policy');
  }

  const packageAssets = entries.flatMap((entry) => {
    const match = /^assets\/([0-9a-f]{64})\.([a-z0-9]{1,16})$/.exec(entry.path);
    return match ? [{ entry, hash: match[1]!, extension: match[2]! }] : [];
  });
  if (manifest.assetCount !== packageAssets.length) {
    throw new Error('import: manifest asset count mismatch');
  }
  const packageAssetHashes = new Set<string>();
  for (const { entry, hash } of packageAssets) {
    const actual = await webSha256(entry.data);
    if (actual !== hash) throw new Error(`import: asset hash mismatch for ${entry.path}`);
    packageAssetHashes.add(hash);
  }
  for (const hash of referencedAssetHashes(snapshot, evidence)) {
    if (!packageAssetHashes.has(hash)) {
      throw new Error(`import: missing referenced asset ${hash}`);
    }
  }

  const runtimeFiles = entries.flatMap((entry) => {
    if (!entry.path.startsWith('runtime/')) return [];
    if (entry.path === runtimeIndexPath) return [];
    const match = /^runtime\/evidence\/(.+)\.([a-z0-9]{1,16})$/.exec(entry.path);
    if (!match) throw new Error(`import: unsupported runtime file ${entry.path}`);
    return [{ entry, path: match[1]!, extension: match[2]! }];
  });
  if (!manifest.runtime?.evidenceIncluded && runtimeFiles.length > 0) {
    throw new Error('import: runtime files present without inclusion policy');
  }

  const sourceBytes: { sha256: ContentHash; bytes: Uint8Array }[] = [];
  if (manifest.sourceCount !== undefined && manifest.sourceCount !== snapshot.sources.length) {
    throw new Error('import: manifest source count mismatch');
  }
  if (manifest.version === 2 && snapshot.sources.length > 0 && !manifest.sources) {
    throw new Error('import: v2 source inventory missing');
  }
  if (manifest.sources && manifest.sources.length !== snapshot.sources.length) {
    throw new Error('import: source inventory count mismatch');
  }
  const snapshotSourceIds = new Set<string>(snapshot.sources.map((source) => source.sourceId));
  const sourcePaths = new Set<string>();
  for (const source of manifest.sources ?? []) {
    if (source.metadataPath !== `sources/${source.sourceId}.json`) {
      throw new Error(`import: invalid source metadata path ${source.metadataPath}`);
    }
    const metadataEntry = entryMap.get(source.metadataPath);
    if (!metadataEntry) throw new Error(`import: missing source metadata ${source.metadataPath}`);
    const metadata = parsePackageJson(metadataEntry.data, source.metadataPath);
    if (!metadata || typeof metadata !== 'object') {
      throw new Error(`import: invalid source metadata ${source.metadataPath}`);
    }
    const sourceRecord = metadata as Record<string, unknown>;
    if (sourceRecord.sourceId !== source.sourceId || typeof sourceRecord.sha256 !== 'string') {
      throw new Error(`import: source metadata identity mismatch ${source.metadataPath}`);
    }
    if (!snapshotSourceIds.has(source.sourceId)) {
      throw new Error(`import: source metadata is not present in guide.json ${source.sourceId}`);
    }
    const snapshotSource = snapshot.sources.find((item) => item.sourceId === source.sourceId);
    if (
      !snapshotSource ||
      strFromU8(canonicalJson(sourceRecord)) !== strFromU8(canonicalJson(snapshotSource))
    ) {
      throw new Error(`import: source metadata does not match guide.json ${source.sourceId}`);
    }
    sourcePaths.add(source.metadataPath);
    if (source.bytesPath) {
      if (!/^sources\/[0-9a-f]{64}\.[a-z0-9]{1,16}$/.test(source.bytesPath)) {
        throw new Error(`import: invalid source bytes path ${source.bytesPath}`);
      }
      const bytesEntry = entryMap.get(source.bytesPath);
      if (!bytesEntry) throw new Error(`import: missing source bytes ${source.bytesPath}`);
      const sha256 = sourceRecord.sha256 as ContentHash;
      if (!/^[0-9a-f]{64}$/.test(sha256)) {
        throw new Error(`import: invalid source hash ${source.sourceId}`);
      }
      if ((await webSha256(bytesEntry.data)) !== sha256) {
        throw new Error(`import: source bytes hash mismatch ${source.sourceId}`);
      }
      sourceBytes.push({ sha256, bytes: bytesEntry.data });
    }
  }
  for (const entry of entries) {
    if (
      entry.path.startsWith('sources/') &&
      entry.path.endsWith('.json') &&
      !sourcePaths.has(entry.path)
    ) {
      throw new Error(`import: unlisted source metadata ${entry.path}`);
    }
  }

  const reportRows = entries
    .filter((entry) => entry.path.startsWith('reports/') && entry.path.endsWith('.json'))
    .map((entry) => ({ path: entry.path, report: parsePackageJson(entry.data, entry.path) }));
  const reportPaths = new Set(manifest.reportPaths ?? []);
  if (reportPaths.size !== (manifest.reportPaths ?? []).length) {
    throw new Error('import: duplicate report path');
  }
  for (const path of manifest.reportPaths ?? []) {
    if (!entryMap.has(path)) throw new Error(`import: missing report ${path}`);
  }
  for (const row of reportRows) {
    if (!reportPaths.has(row.path)) throw new Error(`import: unlisted report ${row.path}`);
  }

  const store = new OpfsAssetStore(db());
  for (const { entry, hash, extension } of packageAssets) {
    await store.put(entry.data, packageAssetMimeType(extension), extension);
    const restored = await store.get(hash as ContentHash);
    if (!restored || (await webSha256(restored)) !== hash)
      throw new Error(`import: asset restore failed ${hash}`);
  }
  for (const source of sourceBytes) await storeSourceBytes(db(), source.sha256, source.bytes);

  const guideId = snapshot.guideId;
  const working = createEmptyWorkingGuide();
  const persistence = persistWorkingDoc(working.doc, guideId);
  await persistence.synced;
  seedEmptyWorkingGuide(working, guideId, snapshot.title);
  hydrateWorkingGuide(working, snapshot);

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
  if (evidence.length > 0) await db().evidence.bulkPut(evidence);
  if (reportRows.length > 0) {
    await db().reports.bulkPut([
      ...reportRows.map(({ path, report }) => ({
        id: `${guideId}:${path}`,
        guideId,
        path,
        report,
      })),
      {
        id: `${guideId}:reports/restore.json`,
        guideId,
        path: 'reports/restore.json',
        report: {
          format: 'gforge-restore',
          manifestVersion: manifest.version,
          targetSchemaVersion: snapshot.schemaVersion,
          warnings,
          restoredAtIso: new Date().toISOString(),
        },
      },
    ]);
  } else {
    await db().reports.put({
      id: `${guideId}:reports/restore.json`,
      guideId,
      path: 'reports/restore.json',
      report: {
        format: 'gforge-restore',
        manifestVersion: manifest.version,
        targetSchemaVersion: snapshot.schemaVersion,
        warnings,
        restoredAtIso: new Date().toISOString(),
      },
    });
  }
  if (runtimeFiles.length > 0) {
    await db().runtimeBlobs.bulkPut(
      runtimeFiles.map(({ entry, path, extension }) => ({
        id: `${guideId}:${path}`,
        guideId,
        path,
        bytes: entry.data.slice(),
        mimeType: packageAssetMimeType(extension),
        extension,
      })),
    );
    for (const file of runtimeFiles.filter(
      (candidate) => candidate.path.startsWith('session-') && candidate.extension === 'json',
    )) {
      const parsed = parsePackageJson(file.entry.data, `runtime/evidence/${file.path}.json`);
      if (!isRuntimeSession(parsed) || parsed.guideId !== guideId) {
        throw new Error(`import: invalid runtime session ${file.path}`);
      }
      await db().runtimeSessions.put(parsed);
    }
  }
  await persistence.provider.destroy();
  working.doc.destroy();
  return { guideId, title: snapshot.title, warnings };
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
  const validation = await validateReferencedAssets(session);
  if (validation.missing.length > 0) {
    throw new Error(`release: missing referenced assets: ${validation.missing.join(', ')}`);
  }
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
