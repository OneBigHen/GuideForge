import { openDb, OpfsAssetStore, type GuideForgeDb } from '@guideforge/storage-web';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetLibrary, ensureSeedCatalog, SEED_CATALOG } from './assetLibrary';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('ensureSeedCatalog', () => {
  let db: GuideForgeDb;
  let library: AssetLibrary;

  beforeEach(async () => {
    // fake-indexeddb keeps one factory per file; wipe the named DB so each
    // test starts from true zero state.
    db?.close();
    await Dexie.delete('guideforge');
    db = openDb();
    library = new AssetLibrary(db, new OpfsAssetStore(db));
  });

  it('creates every seed catalog entry on first run', async () => {
    const result = await ensureSeedCatalog(library);
    expect(result.created).toBe(SEED_CATALOG.length);
    expect(result.existing).toBe(0);
    expect(await library.list()).toHaveLength(SEED_CATALOG.length);
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const first = await ensureSeedCatalog(library);
    const second = await ensureSeedCatalog(library);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(first.created);
    expect((await db.assets.count()) === SEED_CATALOG.length).toBe(true);
  });

  it('keeps procedural provenance and license metadata', async () => {
    await ensureSeedCatalog(library);
    const workbench = (await library.list()).find((entry) =>
      entry.metadata?.name.toLowerCase().includes('workbench'),
    );
    expect(workbench).toBeDefined();
    expect(workbench?.metadata?.origin.kind).toBe('procedural');
    expect(workbench?.metadata?.origin.licenseId).toBe('CC0');
    expect(workbench?.metadata?.format).toBe('glb');
  });
});
