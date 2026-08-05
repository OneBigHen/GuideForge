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

/** Deep-equal on JSON-safe values (arrays/objects/strings/numbers/booleans/null). */
function jsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Compare two snapshots semantically. Order of keys does not matter. */
export function compareSnapshots(a: GuideSnapshot, b: GuideSnapshot): ComparisonDiff {
  const differences: string[] = [];

  if (a.schemaVersion !== b.schemaVersion) differences.push('schemaVersion');
  if (a.guideId !== b.guideId) differences.push('guideId');
  if (a.title !== b.title) differences.push('title');
  if (a.description !== b.description) differences.push('description');
  if (a.lifecycleState !== b.lifecycleState) differences.push('lifecycleState');

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

  // Steps: all text, warnings/tools/parts/media, and citations by id.
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
    if (!jsonEquals(sa.media, sb.media)) differences.push(`step ${sa.stepId} media`);
  }

  // Scene: full canonical scene (nodes, transforms, cameras, annotations).
  if (!jsonEquals(a.scene, b.scene)) {
    differences.push('scene (nodes/transforms/cameras/annotations)');
  }

  // Training: objectives, assessments, modules, mastery.
  if (!jsonEquals(a.training, b.training)) {
    differences.push('training (objectives/assessments/modules/mastery)');
  }

  // Sources: hashes, regions, provenance receipts.
  if (!jsonEquals(a.sources, b.sources)) {
    differences.push('sources/regions/provenance');
  }

  return { differences };
}

/** True when the two snapshots are semantically identical. */
export function snapshotsSemanticallyEqual(a: GuideSnapshot, b: GuideSnapshot): boolean {
  return compareSnapshots(a, b).differences.length === 0;
}
