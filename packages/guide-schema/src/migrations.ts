/**
 * Pure schema migration runner.
 *
 * Migrations are pure functions `(input: unknown) => unknown`. The runner
 * dispatches by the `schemaVersion` field present on the input, applying each
 * migration in sequence until reaching the target version. It never mutates
 * its input.
 */
import { sha256Hex, type ContentHash, type EntityId } from '@guideforge/domain';
import {
  createEmptyScene,
  createEmptyTraining,
  GUIDE_SCHEMA_VERSION,
  type GuideSnapshot,
  type GuideSource,
  type LegacySourceRecord,
  type SourceRegion,
} from './index.js';

export interface SchemaMigration {
  fromVersion: number;
  toVersion: number;
  /** Pure: must not mutate `input`; must not read global state. */
  migrate: (input: Record<string, unknown>) => Record<string, unknown>;
}

const MIGRATIONS: SchemaMigration[] = [];

/**
 * v1 -> v2: the guide gains canonical scene, training, and source structures.
 * v1 snapshots carry only procedure content; the new structures start empty.
 */
registerMigration({
  fromVersion: 1,
  toVersion: 2,
  migrate: (input) => {
    const next = { ...input, schemaVersion: 2 } as Record<string, unknown>;
    if (!('scene' in next)) next.scene = createEmptyScene();
    if (!('training' in next)) next.training = createEmptyTraining();
    if (!('sources' in next)) next.sources = [];
    return next;
  },
});

/**
 * v3 -> v4: provenance becomes part of the canonical project. The source
 * rows that previously lived only in Dexie are converted by the same pure
 * mapper used by the storage adapter; old snapshot sources get the new
 * defaults without losing their existing regions.
 */
registerMigration({
  fromVersion: 3,
  toVersion: 4,
  migrate: (input) => {
    const next = { ...input, schemaVersion: 4 } as Record<string, unknown>;
    if (Array.isArray(next.steps)) {
      next.steps = (next.steps as unknown[]).map((step: unknown) => {
        if (typeof step !== 'object' || step === null) return step;
        const s = { ...step } as Record<string, unknown>;
        if (!Array.isArray(s.claimIds)) s.claimIds = [];
        return s;
      });
    }
    const scene = next.scene as Record<string, unknown> | undefined;
    if (scene && !Array.isArray(scene.anchors)) scene.anchors = [];
    const training = next.training as Record<string, unknown> | undefined;
    if (training && !Array.isArray(training.lessons)) training.lessons = [];
    if (!Array.isArray(next.claims)) next.claims = [];
    if (!Array.isArray(next.citations)) next.citations = [];
    if (!Array.isArray(next.generationRuns)) next.generationRuns = [];
    if (Array.isArray(next.sources)) {
      next.sources = next.sources.map((source: unknown) => normalizeSnapshotSource(source));
    }
    return next;
  },
});

function normalizeSnapshotSource(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const source = { ...value } as Record<string, unknown>;
  source.kind = source.kind ?? 'unknown';
  source.receivedAtIso = source.receivedAtIso ?? '1970-01-01T00:00:00.000Z';
  source.status = source.status ?? 'ready';
  if (Array.isArray(source.regions)) {
    source.regions = source.regions.map((region: unknown) => {
      if (typeof region !== 'object' || region === null) return region;
      const r = { ...region } as Record<string, unknown>;
      const text = typeof r.text === 'string' ? r.text : '';
      r.sourceHash = r.sourceHash ?? source.sha256;
      r.locator = r.locator ?? { kind: 'page', pageIndex: 0 };
      r.contentHash = r.contentHash ?? hashText(text);
      r.confidence = r.confidence ?? 1;
      return r;
    });
  }
  return source;
}

/** Convert a legacy Dexie SourceRecord into canonical project provenance. */
export function migrateLegacySourceRecord(input: LegacySourceRecord): GuideSource {
  const sourceHash = input.sha256 as ContentHash;
  const regions: SourceRegion[] = [];
  const seen = new Set<string>();
  const add = (region: SourceRegion): void => {
    if (seen.has(region.regionId)) return;
    seen.add(region.regionId);
    regions.push(region);
  };

  for (const region of input.regions) {
    add({
      regionId: region.regionId,
      sourceHash,
      locator: region.locator ?? { kind: 'page', pageIndex: region.pageIndex },
      structuralPath: region.structuralPath,
      type: region.kind,
      text: region.excerpt,
      contentHash: hashText(region.excerpt),
      confidence: 1,
    });
  }
  for (const table of input.tables) {
    const text = [table.header, ...table.rows].map((row) => row.join('\u241e')).join('\u241f');
    add({
      regionId: table.regionId,
      sourceHash,
      locator: { kind: 'page', pageIndex: table.pageIndex },
      structuralPath: `table:${table.regionId}`,
      type: 'table',
      text,
      contentHash: hashText(text),
      confidence: 1,
    });
  }
  for (const segment of input.mediaSegments) {
    const text = segment.transcript ?? '';
    add({
      regionId: segment.segmentId,
      sourceHash,
      locator: {
        kind: 'time',
        startMs: Math.round(segment.startSec * 1000),
        endMs: Math.round(segment.endSec * 1000),
      },
      structuralPath: `media:${segment.kind}:${segment.startSec}`,
      type: segment.kind,
      ...(text ? { text } : {}),
      contentHash: hashText(text || `${segment.kind}:${segment.startSec}:${segment.endSec}`),
      confidence: 1,
    });
  }

  return {
    sourceId: input.sourceId as EntityId,
    sha256: sourceHash,
    originalName: input.originalFilename,
    mediaType: input.detectedType,
    kind: input.kind,
    sizeBytes: input.sizeBytes,
    pageCount: input.pageCount,
    durationMs: null,
    receivedAtIso: input.receivedAtIso,
    pipeline: input.receipt?.converter ?? 'legacy-dexie',
    pipelineVersion: input.receipt?.pipelineVersion ?? 'v3',
    status: legacyStatus(input.status),
    regions,
    provenanceReceipt: {
      receipt: input.receipt,
      ocrRoute: input.ocrRoute,
      conflicts: input.conflicts,
    },
  };
}

function legacyStatus(status: LegacySourceRecord['status']): GuideSource['status'] {
  if (status === 'complete') return 'ready';
  if (status === 'asr-pending') return 'processing';
  return status;
}

function hashText(text: string): ContentHash {
  return sha256Hex(new TextEncoder().encode(text)) as ContentHash;
}

/**
 * v2 -> v3: GuideStep gains values, conditions, and verification arrays
 * (Phase 06 source-grounded procedure synthesis). Existing steps start empty.
 */
registerMigration({
  fromVersion: 2,
  toVersion: 3,
  migrate: (input) => {
    const next = { ...input, schemaVersion: 3 } as Record<string, unknown>;
    if (Array.isArray(next.steps)) {
      next.steps = (next.steps as unknown[]).map((step: unknown) => {
        if (typeof step !== 'object' || step === null) return step;
        const s = { ...step } as Record<string, unknown>;
        if (!Array.isArray(s.values)) s.values = [];
        if (!Array.isArray(s.conditions)) s.conditions = [];
        if (!Array.isArray(s.verification)) s.verification = [];
        return s;
      });
    }
    return next;
  },
});

/**
 * Register a migration. The canonical list is derived from this module; tests
 * assert the chain is contiguous and ends at GUIDE_SCHEMA_VERSION.
 */
export function registerMigration(migration: SchemaMigration): void {
  MIGRATIONS.push(migration);
}

/** Migrate an unknown persisted value to the current schema version. */
export function migrateToCurrent(input: unknown): GuideSnapshot {
  if (typeof input !== 'object' || input === null) {
    throw new Error('migration: input must be an object');
  }
  let current = input as Record<string, unknown>;
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 0;

  for (let guard = 0; guard < 100; guard++) {
    if (version === GUIDE_SCHEMA_VERSION) break;
    const next = MIGRATIONS.find((m) => m.fromVersion === version);
    if (!next) {
      throw new Error(`migration: no migration from schema version ${version}`);
    }
    if (next.toVersion <= version) {
      throw new Error(
        `migration: non-progressing migration ${next.fromVersion} -> ${next.toVersion}`,
      );
    }
    current = next.migrate(current);
    version = next.toVersion;
  }

  if (version !== GUIDE_SCHEMA_VERSION) {
    throw new Error(
      `migration: could not reach version ${GUIDE_SCHEMA_VERSION} (stopped at ${version})`,
    );
  }
  return current as unknown as GuideSnapshot;
}

/** Validation used by tests and the draft package writer. */
export function assertSnapshotValid(snapshot: unknown): asserts snapshot is GuideSnapshot {
  if (!isGuideSnapshot(snapshot)) {
    throw new Error('migration result is not a valid GuideSnapshot');
  }
}

import { isGuideSnapshot } from './index.js';

export function migrationChainComplete(): boolean {
  const versions = MIGRATIONS.map((m) => m.fromVersion).sort((a, b) => a - b);
  // The chain must be contiguous from 1 up to (current - 1): every older
  // version must have exactly one forward migration.
  if (versions.length === 0) return (GUIDE_SCHEMA_VERSION as number) === 1;
  for (let i = 0; i < versions.length; i++) {
    if (versions[i] !== i + 1) return false;
  }
  return versions.length === GUIDE_SCHEMA_VERSION - 1;
}
