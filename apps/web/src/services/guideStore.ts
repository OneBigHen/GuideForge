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
