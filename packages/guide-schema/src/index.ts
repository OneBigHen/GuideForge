/**
 * @guideforge/guide-schema — checked-in JSON Schema for persisted structures.
 *
 * Schema files live under `schemas/` and are the canonical source of truth.
 * Types are derived by hand from those schemas and verified against fixtures.
 * Framework-independent: no React/Node/db imports.
 */

import type { EntityId, GuideLifecycleState } from '@guideforge/domain';

export const GUIDE_SCHEMA_VERSION = 1;

export interface GuideWarning {
  warningId: EntityId;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface GuideTool {
  toolId: EntityId;
  name: string;
}

export interface GuidePart {
  partId: EntityId;
  name: string;
  quantity: number;
}

export interface MediaReference {
  referenceId: EntityId;
  /** SHA-256 of the referenced asset. */
  assetHash: string;
  mimeType: string;
  kind: 'image' | 'video' | 'model' | 'audio';
  caption?: string;
}

export interface GuideStep {
  stepId: EntityId;
  taskId: EntityId;
  /** Structured instruction text (rich text serialized). */
  instructionText: string;
  warnings: GuideWarning[];
  tools: GuideTool[];
  parts: GuidePart[];
  media: MediaReference[];
}

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
  steps: GuideStep[];
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
    typeof v.lifecycleState === 'string' &&
    Array.isArray(v.tasks) &&
    Array.isArray(v.steps)
  );
}

export function isGuideTask(value: unknown): value is GuideTask {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.taskId === 'string' && typeof v.title === 'string' && Array.isArray(v.stepIds);
}

export function isGuideStep(value: unknown): value is GuideStep {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stepId === 'string' &&
    typeof v.taskId === 'string' &&
    typeof v.instructionText === 'string' &&
    Array.isArray(v.warnings) &&
    Array.isArray(v.tools) &&
    Array.isArray(v.parts) &&
    Array.isArray(v.media)
  );
}

export { migrateToCurrent, migrationChainComplete, registerMigration } from './migrations.js';
export type { SchemaMigration } from './migrations.js';
