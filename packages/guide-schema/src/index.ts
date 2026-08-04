/**
 * @guideforge/guide-schema — checked-in JSON Schema for persisted structures.
 *
 * Schema files live under `schemas/` and are the canonical source of truth.
 * `src/index.ts` re-exports versioned schema constants. Framework-independent.
 */

export const GUIDE_SCHEMA_VERSION = 1;

export interface GuideSnapshot {
  schemaVersion: 1;
  guideId: string;
  title: string;
  description: string;
  lifecycleState: 'draft' | 'in-review' | 'approved' | 'signing' | 'released';
  createdAtIso: string;
  updatedAtIso: string;
  tasks: GuideTask[];
}

export interface GuideTask {
  taskId: string;
  title: string;
  stepIds: string[];
}

export function isGuideSnapshot(value: unknown): value is GuideSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === GUIDE_SCHEMA_VERSION &&
    typeof v.guideId === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.tasks)
  );
}
