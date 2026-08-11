/**
 * Pure schema migration runner.
 *
 * Migrations are pure functions `(input: unknown) => unknown`. The runner
 * dispatches by the `schemaVersion` field present on the input, applying each
 * migration in sequence until reaching the target version. It never mutates
 * its input.
 */
import {
  createEmptyScene,
  createEmptyTraining,
  GUIDE_SCHEMA_VERSION,
  type GuideSnapshot,
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
