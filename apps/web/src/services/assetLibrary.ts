/**
 * Asset library service (apps/web).
 *
 * Wraps the content-addressed store + Dexie asset metadata with the
 * `@guideforge/assets` domain: local search, license policy, procedural
 * scientific templates, and the seed catalog. Local search always runs before
 * any external provider (Phase 04 gate).
 */
import {
  decideLicense,
  generateProceduralGlb,
  PROCEDURAL_TEMPLATES,
  searchAssets,
  type AssetMetadata,
  type ProceduralTemplate,
  type SearchResult,
} from '@guideforge/assets';
import type { ContentHash } from '@guideforge/domain';
import type { AssetMetaRecord, GuideForgeDb, OpfsAssetStore } from '@guideforge/storage-web';

export interface AssetLibraryEntry {
  hash: ContentHash;
  meta: AssetMetaRecord;
  metadata: AssetMetadata | null;
  licenseBlocks: string[];
}

export class AssetLibrary {
  constructor(
    private readonly db: GuideForgeDb,
    private readonly store: OpfsAssetStore,
  ) {}

  async list(): Promise<AssetLibraryEntry[]> {
    const metas = await this.db.assets.orderBy('hash').toArray();
    return metas.map((meta) => this.toEntry(meta));
  }

  async search(text: string, opts?: { format?: string[] }): Promise<SearchResult[]> {
    const metas = await this.db.assets.orderBy('hash').toArray();
    const assets = metas.map((m) => this.toMetadata(m));
    return searchAssets(assets, { text, ...(opts?.format ? { format: opts.format } : {}) });
  }

  /** Import a GLB/GLTF/OBJ/STL file into the content store + metadata. */
  async importBytes(
    bytes: Uint8Array,
    name: string,
    mimeType: string,
    extension: string,
  ): Promise<AssetLibraryEntry> {
    const meta = await this.store.put(bytes, mimeType, extension);
    const metadata = this.buildMetadata(meta, name, { kind: 'import' });
    await this.db.assets.put({ ...meta, ...metadata });
    return this.toEntry(meta);
  }

  /** Create a procedural scientific template asset (deterministic GLB). */
  async addProcedural(template: ProceduralTemplate): Promise<AssetLibraryEntry> {
    const info = PROCEDURAL_TEMPLATES[template];
    const bytes = generateProceduralGlb(template);
    const meta = await this.store.put(bytes, 'model/gltf-binary', 'glb');
    const metadata = this.buildMetadata(meta, info.displayName, {
      kind: 'procedural',
      attribution: 'GuideForge procedural template',
      licenseId: 'CC0',
      licenseText: 'Generated locally; no external source.',
    });
    await this.db.assets.put({ ...meta, ...metadata });
    return this.toEntry(meta);
  }

  /** Resolve an asset hash to its bytes (for scene attachment / preview). */
  async getBytes(hash: ContentHash): Promise<Uint8Array | null> {
    return this.store.get(hash);
  }

  private toEntry(meta: AssetMetaRecord): AssetLibraryEntry {
    const metadata = this.tryMetadata(meta);
    const licenseBlocks = metadata ? decideLicense(metadata.origin).blocks : [];
    return { hash: meta.hash, meta, metadata, licenseBlocks };
  }

  private toMetadata(meta: AssetMetaRecord): AssetMetadata {
    return this.tryMetadata(meta) ?? this.buildMetadata(meta, 'Untitled asset', { kind: 'import' });
  }

  private tryMetadata(meta: AssetMetaRecord): AssetMetadata | null {
    const maybe = meta as unknown as Partial<AssetMetadata>;
    if (maybe.name === undefined) return null;
    return maybe as AssetMetadata;
  }

  private buildMetadata(
    meta: AssetMetaRecord,
    name: string,
    origin: AssetMetadata['origin'],
  ): AssetMetadata {
    const assetId = (meta.hash.slice(0, 8) +
      '-' +
      meta.hash.slice(8, 12) +
      '-4' +
      meta.hash.slice(12, 15) +
      '-' +
      '8' +
      meta.hash.slice(15, 18) +
      '-' +
      meta.hash.slice(18, 30)) as AssetMetadata['assetId'];
    return {
      assetId,
      contentHash: meta.hash,
      derivativeHashes: [],
      name,
      aliases: [],
      tags: [],
      format:
        meta.extension === 'gltf' ||
        meta.extension === 'obj' ||
        meta.extension === 'stl' ||
        meta.extension === 'step'
          ? meta.extension
          : 'glb',
      mimeTypes: [meta.mimeType],
      sizeBytes: meta.sizeBytes,
      dimensionsMeters: null,
      origin,
      reviewState: origin.kind === 'procedural' ? 'generated-draft' : 'visually-reviewed',
      geometryHealth: null,
      semanticAliases: [],
      semanticAnchors: [],
      usedByProjectIds: [],
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    };
  }
}

/** Seed catalog: curated open-license equipment presets (deterministic). */
export const SEED_CATALOG: { template: ProceduralTemplate; source: string; license: string }[] = [
  { template: 'simple-pipette', source: 'procedural', license: 'CC0' },
  { template: 'beaker', source: 'procedural', license: 'CC0' },
  { template: 'erlenmeyer-flask', source: 'procedural', license: 'CC0' },
  { template: 'graduated-cylinder', source: 'procedural', license: 'CC0' },
  { template: 'vial', source: 'procedural', license: 'CC0' },
  { template: 'test-tube', source: 'procedural', license: 'CC0' },
  { template: 'tube-rack', source: 'procedural', license: 'CC0' },
  { template: 'bottle', source: 'procedural', license: 'CC0' },
  { template: 'tray', source: 'procedural', license: 'CC0' },
  { template: 'tubing', source: 'procedural', license: 'CC0' },
  { template: 'gauge', source: 'procedural', license: 'CC0' },
  { template: 'valve', source: 'procedural', license: 'CC0' },
  { template: 'filter-housing', source: 'procedural', license: 'CC0' },
  { template: 'cartridge', source: 'procedural', license: 'CC0' },
  { template: 'peristaltic-pump', source: 'procedural', license: 'CC0' },
  { template: 'workbench', source: 'procedural', license: 'CC0' },
  { template: 'balance-proxy', source: 'procedural', license: 'CC0' },
  { template: 'hot-plate', source: 'procedural', license: 'CC0' },
  { template: 'magnetic-stirrer', source: 'procedural', license: 'CC0' },
];
