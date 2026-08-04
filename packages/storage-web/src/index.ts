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
  guideId: string;
  commandType: string;
  payload: Record<string, unknown>;
  summary: string;
  confidence: number;
  sourceHash: string | null;
  createdAtIso: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export class GuideForgeDb extends Dexie {
  guides!: Table<LibraryGuideMeta, string>;
  assets!: Table<AssetMetaRecord, string>;
  assetBlobs!: Table<{ hash: string; bytes: Blob }, string>;
  evidence!: Table<EvidenceRecord, string>;
  proposals!: Table<AiProposalRecord, string>;

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
  }
}

export function openDb(): GuideForgeDb {
  return new GuideForgeDb();
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
  /** Deduplicates: returns existing record if the hash is already present. */
  status(): Promise<StorageHealth>;
}

export interface StorageHealth {
  opfsSupported: boolean;
  persistentGranted: boolean;
  estimatedQuotaBytes: number | null;
  estimatedUsageBytes: number | null;
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
  private readonly blobs: Table<{ hash: string; bytes: Blob }, string>;

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
    await this.blobs.put({ hash, bytes: new Blob([bytes as BlobPart], { type: meta.mimeType }) });
    await this.db.assets.put(record);
    return record;
  }

  async get(hash: ContentHash): Promise<Uint8Array | null> {
    const row = await this.blobs.get(hash);
    if (!row) return null;
    return new Uint8Array(await row.bytes.arrayBuffer());
  }

  async has(hash: ContentHash): Promise<boolean> {
    return (await this.db.assets.get(hash)) !== undefined;
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
    return { opfsSupported, persistentGranted, estimatedQuotaBytes, estimatedUsageBytes };
  }

  /** Request persistent storage; returns whether the grant was issued. */
  async requestPersistence(): Promise<boolean> {
    const storage = (globalThis.navigator as { storage?: StorageManager } | undefined)?.storage;
    if (!storage || !('persist' in storage)) return false;
    return storage.persist();
  }
}
