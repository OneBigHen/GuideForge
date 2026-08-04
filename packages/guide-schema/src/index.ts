/**
 * @guideforge/guide-schema — checked-in JSON Schema for persisted structures.
 *
 * Schema files live under `schemas/` and are the canonical source of truth.
 * Types are derived by hand from those schemas and verified against fixtures.
 * Framework-independent: no React/Node/db imports.
 */

import type { EntityId, GuideLifecycleState } from '@guideforge/domain';

export const GUIDE_SCHEMA_VERSION = 1;

export interface GuideTask {
  taskId: EntityId;
  title: string;
  stepIds: EntityId[];
}

export interface GuideSnapshot {
  schemaVersion: 1;
  guideId: EntityId;
  title: string;
  description: string;
  lifecycleState: GuideLifecycleState;
  createdAtIso: string;
  updatedAtIso: string;
  tasks: GuideTask[];
}

export function isGuideSnapshot(value: unknown): value is GuideSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === GUIDE_SCHEMA_VERSION &&
    typeof v.guideId === 'string' &&
    typeof v.title === 'string' &&
    typeof v.description === 'string' &&
    typeof v.createdAtIso === 'string' &&
    typeof v.updatedAtIso === 'string' &&
    Array.isArray(v.lifecycleState) === false &&
    typeof v.lifecycleState === 'string' &&
    Array.isArray(v.tasks)
  );
}

export function isGuideTask(value: unknown): value is GuideTask {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.taskId === 'string' && typeof v.title === 'string' && Array.isArray(v.stepIds);
}

export { migrateToCurrent, migrationChainComplete, registerMigration } from './migrations.js';
export type { SchemaMigration } from './migrations.js';
