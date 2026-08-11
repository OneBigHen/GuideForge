/**
 * Strict validation, source coverage, ambiguity surfacing, and the one
 * bounded repair for synthesized procedure plans.
 */
import type { ExtractionOutput, ExtractionStep, ExtractionTask } from '@guideforge/ai-contracts';
import {
  normalizeToken,
  structuredValueGrounded,
  type SourceCoverage,
  type SynthesisAmbiguity,
  type SynthesisIssue,
  type SynthesisRegion,
  type SynthesisRepair,
  type SynthesisSource,
} from './types.js';

/** Strict validation: every actionable step cites a real region; values grounded. */
export function validateSynthesisPlan(
  plan: ExtractionOutput,
  regions: Map<string, SynthesisRegion>,
  sourceHashes: Set<string>,
): { issues: SynthesisIssue[]; ok: boolean } {
  const issues: SynthesisIssue[] = [];
  const seenStepIds = new Set<string>();

  for (const task of plan.tasks) {
    if (!task.taskId || task.taskId.length === 0) {
      issues.push({ severity: 'error', code: 'missing-task-id', message: 'task has no id' });
    }
    for (const step of task.steps) {
      if (seenStepIds.has(step.stepId)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-step-id',
          message: `duplicate step id ${step.stepId}`,
          stepId: step.stepId,
        });
      }
      seenStepIds.add(step.stepId);
      if (!step.action || step.action.length === 0) {
        issues.push({
          severity: 'error',
          code: 'empty-action',
          message: `step ${step.stepId} has no action`,
          stepId: step.stepId,
        });
      }
      if (step.citations.length === 0) {
        issues.push({
          severity: 'error',
          code: 'uncited-step',
          message: `step ${step.stepId} has no citation`,
          stepId: step.stepId,
        });
      }
      for (const regionId of step.citations) {
        const region = regions.get(regionId);
        if (!region) {
          issues.push({
            severity: 'error',
            code: 'unknown-region',
            message: `step ${step.stepId} cites unknown region ${regionId}`,
            stepId: step.stepId,
            regionId,
          });
          continue;
        }
        const grounded = step.values.filter(
          (v) =>
            ![...step.citations]
              .map((id) => regions.get(id))
              .some((candidate) => candidate && structuredValueGrounded(v, candidate)),
        );
        for (const v of grounded) {
          issues.push({
            severity: 'error',
            code: 'invented-value',
            message: `value "${v.label}" is not grounded in region ${regionId}`,
            stepId: step.stepId,
            regionId,
          });
        }
      }
      const taskIds = new Set(plan.tasks.map((t) => t.taskId));
      if (!taskIds.has(step.taskId)) {
        issues.push({
          severity: 'error',
          code: 'orphan-step-task',
          message: `step ${step.stepId} references missing task ${step.taskId}`,
          stepId: step.stepId,
        });
      }
    }
  }
  if (sourceHashes.size === 0) {
    issues.push({ severity: 'warning', code: 'no-sources', message: 'no sources provided' });
  }
  return { issues, ok: issues.every((i) => i.severity !== 'error') };
}

/** Source coverage: fraction of regions actually cited or consumed by the plan. */
export function computeSourceCoverage(
  regions: SynthesisRegion[],
  plan: ExtractionOutput,
  additionallyCovered: string[] = [],
): SourceCoverage {
  const cited = new Set<string>();
  for (const task of plan.tasks) {
    for (const step of task.steps) {
      for (const regionId of step.citations) cited.add(regionId);
    }
  }
  for (const regionId of additionallyCovered) cited.add(regionId);
  const uncited = regions.map((r) => r.regionId).filter((id) => !cited.has(id));
  const totalRegions = regions.length;
  return {
    totalRegions,
    citedRegions: cited.size,
    coverageRatio: totalRegions === 0 ? 0 : cited.size / totalRegions,
    uncitedRegions: uncited,
  };
}

/** Ambiguity / conflict surfacing: empty-text and near-identical regions. */
export function detectAmbiguities(sources: SynthesisSource[]): SynthesisAmbiguity[] {
  const ambiguities: SynthesisAmbiguity[] = [];
  const seen = new Map<string, SynthesisRegion[]>();
  for (const source of sources) {
    for (const region of source.regions) {
      if (region.excerpt.trim().length === 0) {
        ambiguities.push({
          regionId: region.regionId,
          sourceHash: region.sourceHash,
          reason: 'no-text',
          detail: 'region has no extractable text',
        });
        continue;
      }
      const key = normalizeToken(region.excerpt.slice(0, 40));
      if (key.length < 8) continue;
      const prior = seen.get(key);
      if (prior) {
        for (const other of prior) {
          if (other.regionId !== region.regionId) {
            ambiguities.push({
              regionId: region.regionId,
              sourceHash: region.sourceHash,
              reason: 'near-duplicate',
              otherRegionId: other.regionId,
              detail: 'near-identical excerpt across regions',
            });
          }
        }
      }
      seen.set(key, [...(seen.get(key) ?? []), region]);
    }
  }
  return ambiguities;
}

const MAX_REPAIRS = 3;

/**
 * Repairs only deterministic, safe issues and reports exactly what changed.
 * Bounded: at most 3 repairs per run. Never invents content — it only drops
 * ungrounded claims and rewrites orphan task refs to the first task.
 */
export function repairSynthesisPlan(
  plan: ExtractionOutput,
  regions: Map<string, SynthesisRegion>,
): { output: ExtractionOutput; repair: SynthesisRepair } {
  const repairs: string[] = [];
  let droppedActionable = false;
  const firstTaskId = plan.tasks[0]?.taskId;

  const tasks: ExtractionTask[] = [];
  for (const task of plan.tasks) {
    const steps: ExtractionStep[] = [];
    for (const step of task.steps) {
      if (repairs.length >= MAX_REPAIRS) {
        steps.push(step);
        continue;
      }
      if (step.citations.length === 0) {
        repairs.push(`dropped uncited step ${step.stepId}`);
        droppedActionable = true;
        continue;
      }
      const region = regions.get(step.citations[0]!);
      if (!region) {
        repairs.push(`dropped step ${step.stepId} with unknown region`);
        droppedActionable = true;
        continue;
      }
      const validCitations = step.citations.filter((id) => regions.has(id));
      const citedRegions = step.citations
        .map((id) => regions.get(id))
        .filter((candidate): candidate is SynthesisRegion => Boolean(candidate));
      const groundedValues = step.values.filter((v) =>
        citedRegions.some((candidate) => structuredValueGrounded(v, candidate)),
      );
      if (groundedValues.length !== step.values.length) {
        repairs.push(
          `dropped ${step.values.length - groundedValues.length} ungrounded value(s) from step ${step.stepId}`,
        );
      }
      let taskId = step.taskId;
      if (!plan.tasks.some((t) => t.taskId === taskId)) {
        taskId = firstTaskId ?? task.taskId;
        repairs.push(`rewrote orphan step ${step.stepId} task ref to ${taskId}`);
      }
      steps.push({
        ...step,
        citations: validCitations,
        values: groundedValues,
        taskId,
        warnings: step.warnings.slice(0, 3),
        tools: step.tools.slice(0, 3),
        parts: step.parts.slice(0, 3),
        conditions: step.conditions.slice(0, 3),
        verificationSteps: step.verificationSteps.slice(0, 3),
        prerequisites: step.prerequisites.slice(0, 3),
      });
    }
    tasks.push({ ...task, steps });
  }

  return {
    output: { ...plan, tasks },
    repair: { repairs, droppedActionable },
  };
}
