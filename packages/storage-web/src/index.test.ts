import type { EntityId } from '@guideforge/domain';
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { GuideForgeDb, SourceRecord } from './index.js';
import {
  migrateDexieSourcesToCanonical,
  openDb,
  OpfsAssetStore,
  persistWorkingDoc,
} from './index.js';

// fake-indexeddb ships its own structuredClone + IDB; Node's webcrypto is the
// crypto global in vitest's node environment.
const cryptoGlobal = globalThis.crypto as unknown as {
  subtle: { digest: (algo: string, data: BufferSource) => Promise<ArrayBuffer> };
};
if (!cryptoGlobal?.subtle) {
  // polyfill from node:crypto
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000' as EntityId;

describe('storage-web Dexie metadata', () => {
  let db: GuideForgeDb;

  beforeAll(() => {
    db = openDb();
  });

  it('stores and reads guide metadata', async () => {
    await db.guides.put({
      guideId: GUIDE_ID,
      title: 'Demo',
      description: '',
      lifecycleState: 'draft',
      createdAtIso: '2026-01-01T00:00:00Z',
      updatedAtIso: '2026-01-01T00:00:00Z',
      taskCount: 0,
      stepCount: 0,
      docName: GUIDE_ID,
    });
    const meta = await db.guides.get(GUIDE_ID);
    expect(meta?.title).toBe('Demo');
  });

  it('migrates legacy source rows for a guide into canonical sources', async () => {
    const row: SourceRecord = {
      sourceId: '123e4567-e89b-42d3-a456-426614174005',
      guideId: GUIDE_ID,
      originalFilename: 'notes.txt',
      detectedType: 'text/plain',
      kind: 'text',
      sha256: 'c'.repeat(64),
      sizeBytes: 4,
      pageCount: 1,
      receivedAtIso: '2026-01-01T00:00:00.000Z',
      ocrRoute: 'text-layer',
      status: 'complete',
      receipt: null,
      regions: [
        {
          regionId: 'region-2',
          pageIndex: 0,
          kind: 'paragraph',
          excerpt: 'Done.',
          structuralPath: 'block:1',
        },
      ],
      conflicts: [],
      tables: [],
      mediaSegments: [],
    };
    await db.sources.put(row);

    const sources = await migrateDexieSourcesToCanonical(db, GUIDE_ID);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.sha256).toBe(row.sha256);
    expect(sources[0]?.regions[0]?.contentHash).toHaveLength(64);
  });
});

describe('storage-web y-indexeddb persistence', () => {
  it('persists a Y.Doc and reloads it offline', async () => {
    const doc = new Y.Doc();
    doc.getMap('guide').set('title', 'offline-draft');
    const p = persistWorkingDoc(doc, 'doc-offline-test');
    await p.synced;
    void p.provider.destroy();

    // Simulate restart: new doc + provider with same name.
    const doc2 = new Y.Doc();
    const p2 = persistWorkingDoc(doc2, 'doc-offline-test');
    await p2.synced;
    expect(doc2.getMap('guide').get('title')).toBe('offline-draft');
    void p2.provider.destroy();
  });
});

describe('storage-web OPFS asset store (IndexedDB fallback path)', () => {
  let db: GuideForgeDb;
  let store: OpfsAssetStore;

  beforeAll(() => {
    db = openDb();
    store = new OpfsAssetStore(db);
  });

  it('stores and retrieves bytes by content hash', async () => {
    const bytes = new Uint8Array([10, 20, 30]);
    const record = await store.put(bytes, 'application/octet-stream', 'bin');
    expect(record.hash).toHaveLength(64);
    expect(record.location).toBe('indexeddb'); // OPFS unavailable in jsdom

    const loaded = await store.get(record.hash);
    expect(loaded).toEqual(bytes);
  });

  it('deduplicates identical content', async () => {
    const bytes = new Uint8Array([7, 7, 7, 7]);
    const a = await store.put(bytes, 'application/octet-stream', 'bin');
    const b = await store.put(bytes, 'application/octet-stream', 'bin');
    expect(a.hash).toBe(b.hash);
    const count = await db.assets.where('hash').equals(a.hash).count();
    expect(count).toBe(1);
  });

  it('lists assets and removes only unreferenced content', async () => {
    const keep = await store.put(new Uint8Array([1, 2]), 'application/octet-stream', 'bin');
    const drop = await store.put(new Uint8Array([3, 4]), 'application/octet-stream', 'bin');
    expect((await store.list()).some((record) => record.hash === keep.hash)).toBe(true);

    const removed = await store.garbageCollect(new Set([keep.hash]));
    expect(removed).toContain(drop.hash);
    expect(await store.has(keep.hash)).toBe(true);
    expect(await store.has(drop.hash)).toBe(false);
  });

  it('reports storage health without OPFS', async () => {
    const health = await store.status();
    expect(health.opfsSupported).toBe(false);
    expect(health.quotaWarning).toBe('unknown');
  });
});
