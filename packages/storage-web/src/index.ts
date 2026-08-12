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
import type { PhotoTo3DJob } from '@guideforge/assets';
import type { ContentHash } from '@guideforge/domain';
import {
  migrateLegacySourceRecord,
  type GuideSource,
  type LegacySourceRecord,
  type TrainingSession,
} from '@guideforge/guide-schema';
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

export interface SourceBlobRecord {
  sha256: ContentHash;
  bytes: Uint8Array | ArrayBuffer | Blob;
}

export interface PackageReportRecord {
  id: string;
  guideId: string;
  path: string;
  report: unknown;
}

export interface RuntimeBlobRecord {
  id: string;
  guideId: string;
  path: string;
  bytes: Uint8Array | ArrayBuffer | Blob;
  mimeType: string;
  extension: string;
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

/** Offline learner progress; the canonical training graph stays in Yjs. */
export type TrainingSessionRecord = TrainingSession;

/** Local browser queue record; the native companion mirrors it in SQLite. */
export type PhotoTo3DJobRecord = PhotoTo3DJob;

/** AI proposal awaiting human review. */
export interface AiProposalRecord {
  proposalId: string;
  guideId: string;
  commandType: string;
  payload: Record<string, unknown>;
  summary: string;
  confidence: number;
  sourceHash: string | null;
  /** Source regions cited by this proposal (regionId + page + excerpt hash). */
  citations: {
    regionId: string;
    sourceHash?: string;
    pageIndex: number;
    excerptHash: string;
    claimRef: string;
  }[];
  /** Provider/model/receipt provenance for the generation that produced it. */
  receipt: {
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
  createdAtIso: string;
  status: 'pending' | 'accepted' | 'rejected';
}

/** Legacy Dexie row retained for v3 -> v4 source migration. */
export type SourceRecord = LegacySourceRecord;

export class GuideForgeDb extends Dexie {
  guides!: Table<LibraryGuideMeta, string>;
  assets!: Table<AssetMetaRecord, string>;
  assetBlobs!: Table<{ hash: string; bytes: Uint8Array | ArrayBuffer | Blob }, string>;
  sourceBlobs!: Table<SourceBlobRecord, string>;
  reports!: Table<PackageReportRecord, string>;
  runtimeBlobs!: Table<RuntimeBlobRecord, string>;
  evidence!: Table<EvidenceRecord, string>;
  proposals!: Table<AiProposalRecord, string>;
  sources!: Table<SourceRecord, string>;
  trainingSessions!: Table<TrainingSessionRecord, string>;
  photoJobs!: Table<PhotoTo3DJobRecord, string>;

  constructor() {
    super('guideforge');
    this.version(1).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
    });
    this.version(2).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
    });
    // v3: proposals retain full citation + provider receipt provenance.
    this.version(3).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
    });
    // v4: multimodal source documents (Phase 05 Source Studio).
    this.version(4).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
      sources: 'sourceId, guideId, sha256, receivedAtIso',
    });
    // v5: optional original source bytes for portable backup packages.
    this.version(5).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      sourceBlobs: 'sha256',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
      sources: 'sourceId, guideId, sha256, receivedAtIso',
    });
    // v6: restore reports with the package so migration and validation facts
    // remain available after the import call returns.
    this.version(6).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      sourceBlobs: 'sha256',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
      sources: 'sourceId, guideId, sha256, receivedAtIso',
      reports: 'id, guideId, path',
    });
    // v7: preserve optional runtime/evidence files carried by full backups.
    this.version(7).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      sourceBlobs: 'sha256',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
      sources: 'sourceId, guideId, sha256, receivedAtIso',
      reports: 'id, guideId, path',
      runtimeBlobs: 'id, guideId, path',
    });
    // v8: resumable, offline training attempts and deterministic mastery.
    this.version(8).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      sourceBlobs: 'sha256',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
      sources: 'sourceId, guideId, sha256, receivedAtIso',
      reports: 'id, guideId, path',
      runtimeBlobs: 'id, guideId, path',
      trainingSessions: 'sessionId, guideId, learnerId, status, updatedAtIso',
    });
    // v9: resumable local photo-to-3D jobs and provider provenance.
    this.version(9).stores({
      guides: 'guideId, title, updatedAtIso, lifecycleState',
      assets: 'hash, mimeType, sizeBytes',
      assetBlobs: 'hash',
      sourceBlobs: 'sha256',
      evidence: 'evidenceId, guideId, stepId, capturedAtIso',
      proposals: 'proposalId, guideId, status, createdAtIso',
      sources: 'sourceId, guideId, sha256, receivedAtIso',
      reports: 'id, guideId, path',
      runtimeBlobs: 'id, guideId, path',
      trainingSessions: 'sessionId, guideId, learnerId, status, updatedAtIso',
      photoJobs: 'jobId, status, providerId, reuseKey, updatedAtIso',
    });
  }
}

export function openDb(): GuideForgeDb {
  return new GuideForgeDb();
}

/** Read legacy Dexie source rows once and convert them to project provenance. */
export async function migrateDexieSourcesToCanonical(
  db: GuideForgeDb,
  guideId: string,
): Promise<GuideSource[]> {
  const rows = await db.sources.where('guideId').equals(guideId).toArray();
  return rows.map(migrateLegacySourceRecord);
}

export async function storeSourceBytes(
  db: GuideForgeDb,
  sha256: ContentHash,
  bytes: Uint8Array,
): Promise<void> {
  const actual = (await sha256Hex(bytes)) as ContentHash;
  if (actual !== sha256) throw new Error(`source bytes hash mismatch for ${sha256}`);
  await db.sourceBlobs.put({ sha256, bytes: bytes.slice() });
}

export async function loadSourceBytes(
  db: GuideForgeDb,
  sha256: ContentHash,
): Promise<Uint8Array | null> {
  const row = await db.sourceBlobs.get(sha256);
  if (!row) return null;
  const bytes = row.bytes;
  if (typeof bytes === 'object' && bytes !== null && 'length' in bytes) {
    return Uint8Array.from(bytes as unknown as ArrayLike<number>);
  }
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(await bytes.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Yjs persistence (y-indexeddb)
// ---------------------------------------------------------------------------

export interface YjsPersistenceHandle {
  provider: IndexeddbPersistence;
  doc: Y.Doc;
  /** Resolves once the provider has loaded persisted state. */
  synced: Promise<void>;
}

export function persistWorkingDoc(doc: Y.Doc, docName: string): YjsPersistenceHandle {
  const provider = new IndexeddbPersistence(docName, doc);
  const synced = new Promise<void>((resolve, reject) => {
    provider.once('synced', () => resolve());
    provider.once('error', (err: unknown) =>
      reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
  return { provider, doc, synced };
}

// ---------------------------------------------------------------------------
// Content-addressed asset storage (OPFS with IndexedDB fallback)
// ---------------------------------------------------------------------------

export interface AssetStore {
  put(bytes: Uint8Array, mimeType: string, extension: string): Promise<AssetMetaRecord>;
  get(hash: ContentHash): Promise<Uint8Array | null>;
  has(hash: ContentHash): Promise<boolean>;
  list(): Promise<AssetMetaRecord[]>;
  remove(hash: ContentHash): Promise<void>;
  /** Remove unreferenced content and return the hashes removed. */
  garbageCollect(referenced: ReadonlySet<ContentHash>): Promise<ContentHash[]>;
  status(): Promise<StorageHealth>;
}

export interface StorageHealth {
  opfsSupported: boolean;
  persistentGranted: boolean;
  estimatedQuotaBytes: number | null;
  estimatedUsageBytes: number | null;
  usageRatio: number | null;
  quotaWarning: 'none' | 'near-limit' | 'unknown';
}

function sha256Hex(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest('SHA-256', bytes as BufferSource).then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  );
}

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  );
}

class IndexedDbAssetStore {
  private db: GuideForgeDb;
  private readonly blobs: Table<{ hash: string; bytes: Uint8Array | ArrayBuffer | Blob }, string>;

  constructor(db: GuideForgeDb) {
    this.db = db;
    this.blobs = db.table('assetBlobs');
  }

  async put(
    bytes: Uint8Array,
    meta: Omit<AssetMetaRecord, 'hash' | 'location'>,
  ): Promise<AssetMetaRecord> {
    const hash = (await sha256Hex(bytes)) as ContentHash;
    const record: AssetMetaRecord = { ...meta, hash, location: 'indexeddb' };
    // Store the bytes as a plain Uint8Array (not a bare ArrayBuffer or Blob):
    // some WebKit builds fail to structured-clone a bare ArrayBuffer into
    // IndexedDB ("Error preparing Blob/File data"), while typed arrays clone
    // reliably everywhere.
    await this.blobs.put({ hash, bytes: bytes.slice() });
    await this.db.assets.put(record);
    return record;
  }

  async get(hash: ContentHash): Promise<Uint8Array | null> {
    const row = await this.blobs.get(hash);
    if (!row) return null;
    const bytes = row.bytes;
    // Cross-realm structured-clone results defeat `instanceof` in some
    // engines (WebKit, fake-indexeddb). Duck-type instead.
    if (typeof bytes === 'object' && bytes !== null && 'length' in bytes) {
      const arr = bytes as unknown as ArrayLike<number>;
      return Uint8Array.from(arr);
    }
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    // Backward compatibility: earliest versions stored a Blob.
    return new Uint8Array(await bytes.arrayBuffer());
  }

  async has(hash: ContentHash): Promise<boolean> {
    return (await this.db.assets.get(hash)) !== undefined;
  }

  async list(): Promise<AssetMetaRecord[]> {
    return this.db.assets.toArray();
  }

  async remove(hash: ContentHash): Promise<void> {
    await this.blobs.delete(hash);
    await this.db.assets.delete(hash);
  }

  async garbageCollect(referenced: ReadonlySet<ContentHash>): Promise<ContentHash[]> {
    const removed: ContentHash[] = [];
    for (const record of await this.list()) {
      if (referenced.has(record.hash)) continue;
      await this.remove(record.hash);
      removed.push(record.hash);
    }
    return removed;
  }
}

/**
 * OPFS-backed content-addressed asset store. Falls back to IndexedDB when
 * OPFS is not available. Bytes are stored under their SHA-256, so identical
 * content deduplicates automatically.
 */
export class OpfsAssetStore implements AssetStore {
  private readonly db: GuideForgeDb;
  private readonly fallback: IndexedDbAssetStore;
  private root: FileSystemDirectoryHandle | null = null;

  constructor(db: GuideForgeDb) {
    this.db = db;
    this.fallback = new IndexedDbAssetStore(db);
  }

  private async ensureRoot(): Promise<FileSystemDirectoryHandle | null> {
    if (this.root) return this.root;
    if (!isOpfsSupported()) return null;
    this.root = await navigator.storage.getDirectory();
    return this.root;
  }

  private assetFileName(hash: ContentHash): string {
    return `asset-${hash}`;
  }

  async put(bytes: Uint8Array, mimeType: string, extension: string): Promise<AssetMetaRecord> {
    const hash = (await sha256Hex(bytes)) as ContentHash;
    const existing = await this.db.assets.get(hash);
    if (existing) return existing; // deduplicate

    const root = await this.ensureRoot();
    if (root) {
      try {
        const handle = await root.getFileHandle(this.assetFileName(hash), { create: true });
        const writable = await handle.createWritable();
        await writable.write(bytes as unknown as FileSystemWriteChunkType);
        await writable.close();
        const record: AssetMetaRecord = {
          hash,
          mimeType,
          extension,
          sizeBytes: bytes.length,
          location: 'opfs',
        };
        await this.db.assets.put(record);
        return record;
      } catch {
        // fall through to IndexedDB
      }
    }
    return this.fallback.put(bytes, { mimeType, extension, sizeBytes: bytes.length });
  }

  async get(hash: ContentHash): Promise<Uint8Array | null> {
    const record = await this.db.assets.get(hash);
    if (!record) return null;
    if (record.location === 'indexeddb') return this.fallback.get(hash);

    const root = await this.ensureRoot();
    if (!root) return this.fallback.get(hash);
    try {
      const handle = await root.getFileHandle(this.assetFileName(hash));
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return this.fallback.get(hash);
    }
  }

  async has(hash: ContentHash): Promise<boolean> {
    return (await this.db.assets.get(hash)) !== undefined;
  }

  async list(): Promise<AssetMetaRecord[]> {
    return this.db.assets.toArray();
  }

  async remove(hash: ContentHash): Promise<void> {
    const record = await this.db.assets.get(hash);
    if (!record) return;
    if (record.location === 'indexeddb') {
      await this.fallback.remove(hash);
      return;
    }
    const root = await this.ensureRoot();
    if (root) {
      await root.removeEntry(this.assetFileName(hash));
    }
    await this.db.assets.delete(hash);
  }

  async garbageCollect(referenced: ReadonlySet<ContentHash>): Promise<ContentHash[]> {
    const removed: ContentHash[] = [];
    for (const record of await this.list()) {
      if (referenced.has(record.hash)) continue;
      await this.remove(record.hash);
      removed.push(record.hash);
    }
    return removed;
  }

  async status(): Promise<StorageHealth> {
    const opfsSupported = isOpfsSupported();
    let persistentGranted = false;
    let estimatedQuotaBytes: number | null = null;
    let estimatedUsageBytes: number | null = null;
    const storage = (globalThis.navigator as { storage?: StorageManager } | undefined)?.storage;
    if (storage) {
      if ('persist' in storage) {
        persistentGranted = await storage.persisted();
      }
      if ('estimate' in storage) {
        const est = await storage.estimate();
        estimatedQuotaBytes = est.quota ?? null;
        estimatedUsageBytes = est.usage ?? null;
      }
    }
    const usageRatio =
      estimatedQuotaBytes !== null && estimatedUsageBytes !== null && estimatedQuotaBytes > 0
        ? estimatedUsageBytes / estimatedQuotaBytes
        : null;
    return {
      opfsSupported,
      persistentGranted,
      estimatedQuotaBytes,
      estimatedUsageBytes,
      usageRatio,
      quotaWarning: usageRatio === null ? 'unknown' : usageRatio >= 0.8 ? 'near-limit' : 'none',
    };
  }

  /** Request persistent storage; returns whether the grant was issued. */
  async requestPersistence(): Promise<boolean> {
    const storage = (globalThis.navigator as { storage?: StorageManager } | undefined)?.storage;
    if (!storage || !('persist' in storage)) return false;
    return storage.persist();
  }
}
