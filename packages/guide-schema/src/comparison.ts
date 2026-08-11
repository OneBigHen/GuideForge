/**
 * Semantic snapshot comparison (Phase 02).
 *
 * Compares two canonical GuideSnapshots semantically — all text, ordering,
 * citations, scene (transforms, cameras, annotations), training, and source
 * region references. Used to prove that a `.gforge` round trip preserves
 * everything (export -> import -> materialize -> compare).
 *
 * Pure and framework-independent.
 */
import type { GuideSnapshot } from './index.js';

export interface ComparisonDiff {
  /** Human-readable, stable-ordered list of differences (empty = identical). */
  differences: string[];
}

/** Deep-equal on JSON-safe values without depending on object key order. */
function jsonEquals(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Compare two snapshots semantically. Order of keys does not matter. */
export function compareSnapshots(a: GuideSnapshot, b: GuideSnapshot): ComparisonDiff {
  const differences: string[] = [];

  if (a.schemaVersion !== b.schemaVersion) differences.push('schemaVersion');
  if (a.guideId !== b.guideId) differences.push('guideId');
  if (a.title !== b.title) differences.push('title');
  if (a.description !== b.description) differences.push('description');
  if (a.lifecycleState !== b.lifecycleState) differences.push('lifecycleState');
  if (a.createdAtIso !== b.createdAtIso) differences.push('createdAtIso');
  if (a.updatedAtIso !== b.updatedAtIso) differences.push('updatedAtIso');

  // Tasks: same set and order.
  const aTaskIds = a.tasks.map((t) => t.taskId);
  const bTaskIds = b.tasks.map((t) => t.taskId);
  if (!jsonEquals(aTaskIds, bTaskIds)) differences.push('task order/ids');
  for (const ta of a.tasks) {
    const tb = b.tasks.find((t) => t.taskId === ta.taskId);
    if (!tb) continue;
    if (ta.title !== tb.title) differences.push(`task ${ta.taskId} title`);
    if (!jsonEquals(ta.stepIds, tb.stepIds)) differences.push(`task ${ta.taskId} stepIds`);
  }

  // Steps: all structured procedure content and claim references.
  for (const sa of a.steps) {
    const sb = b.steps.find((s) => s.stepId === sa.stepId);
    if (!sb) {
      differences.push(`missing step ${sa.stepId}`);
      continue;
    }
    if (sa.taskId !== sb.taskId) differences.push(`step ${sa.stepId} taskId`);
    if (sa.instructionText !== sb.instructionText) differences.push(`step ${sa.stepId} text`);
    if (!jsonEquals(sa.warnings, sb.warnings)) differences.push(`step ${sa.stepId} warnings`);
    if (!jsonEquals(sa.tools, sb.tools)) differences.push(`step ${sa.stepId} tools`);
    if (!jsonEquals(sa.parts, sb.parts)) differences.push(`step ${sa.stepId} parts`);
    if (!jsonEquals(sa.values, sb.values)) differences.push(`step ${sa.stepId} values`);
    if (!jsonEquals(sa.conditions, sb.conditions)) differences.push(`step ${sa.stepId} conditions`);
    if (!jsonEquals(sa.verification, sb.verification)) {
      differences.push(`step ${sa.stepId} verification`);
    }
    if (!jsonEquals(sa.media, sb.media)) differences.push(`step ${sa.stepId} media`);
    if (!jsonEquals(sa.claimIds, sb.claimIds)) differences.push(`step ${sa.stepId} claimIds`);
  }
  const aStepIds = a.steps.map((s) => s.stepId);
  const bStepIds = b.steps.map((s) => s.stepId);
  if (!jsonEquals(aStepIds, bStepIds)) differences.push('step ids/order');
  for (const sb of b.steps) {
    if (!a.steps.some((sa) => sa.stepId === sb.stepId)) differences.push(`extra step ${sb.stepId}`);
  }

  // Scene: full canonical scene (nodes, transforms, cameras, annotations).
  if (!jsonEquals(a.scene, b.scene)) {
    differences.push('scene (nodes/transforms/cameras/annotations)');
  }

  // Training: objectives, assessments, modules, lessons, mastery.
  if (!jsonEquals(a.training, b.training)) {
    differences.push('training (objectives/assessments/modules/mastery)');
  }

  // Sources: hashes, regions, provenance receipts.
  if (!jsonEquals(a.sources, b.sources)) {
    differences.push('sources/regions/provenance');
  }

  if (!jsonEquals(a.claims, b.claims)) differences.push('claims');
  if (!jsonEquals(a.citations, b.citations)) differences.push('citations');
  if (!jsonEquals(a.generationRuns, b.generationRuns)) differences.push('generationRuns');

  return { differences };
}

/** True when the two snapshots are semantically identical. */
export function snapshotsSemanticallyEqual(a: GuideSnapshot, b: GuideSnapshot): boolean {
  return compareSnapshots(a, b).differences.length === 0;
}
