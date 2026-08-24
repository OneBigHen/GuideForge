/**
 * Orchestration: turn sources + optional prompt into a validated,
 * repaired SynthesisPlan with coverage and ambiguity surfaced.
 */
import { computeConfidence } from '@guideforge/ai-contracts';
import { extractClaims, planProcedureStructure } from './extract.js';
import type { SynthesisPlan, SynthesisRegion, SynthesisRequest, SynthesisSource } from './types.js';
import {
  computeSourceCoverage,
  detectAmbiguities,
  repairSynthesisPlan,
  validateSynthesisPlan,
} from './validate.js';

const MAX_STEPS_PER_TASK = 50;

/**
 * Synthesize a source-grounded procedure plan. Deterministic given the same
 * sources; never mutates guide content (the caller turns the plan into
 * reviewable proposals).
 */
export function synthesizeProcedure(request: SynthesisRequest): SynthesisPlan {
  const regionMap = new Map<string, SynthesisRegion>();
  for (const source of request.sources) {
    for (const region of source.regions) regionMap.set(region.regionId, region);
  }

  const { tasks, regionsByTask, headingRegionIds } = planProcedureStructure(request.sources);

  const outputTasks = tasks.map((task) => {
    const regions = (regionsByTask.get(task.taskId) ?? []).slice(0, MAX_STEPS_PER_TASK);
    const steps = regions.map((region) => extractClaims(region, task.taskId));
    return { ...task, steps };
  });
  const rawPlan = {
    schemaVersion: 1 as const,
    guideId: request.guideId,
    tasks: outputTasks,
  };

  // Strict validation (before repair) surfaces every issue honestly.
  const { issues } = validateSynthesisPlan(rawPlan, regionMap, sourceHashes(request.sources));

  // One bounded repair for deterministic, safe issues.
  const { output, repair } = repairSynthesisPlan(rawPlan, regionMap);

  // Re-validate the repaired output; it must now pass the citation gate.
  const revalidated = validateSynthesisPlan(output, regionMap, sourceHashes(request.sources));
  const finalIssues = revalidated.ok ? [] : [...issues, ...revalidated.issues];

  const coverage = computeSourceCoverage([...regionMap.values()], output, headingRegionIds);
  const ambiguities = detectAmbiguities(request.sources);

  const confidence = computeConfidence({
    extractionQuality: Math.min(1, (coverage.totalRegions > 0 ? coverage.coverageRatio : 0) + 0.1),
    citationCoverage: coverage.totalRegions === 0 ? 0 : coverage.coverageRatio,
    deterministicValidation: revalidated.ok ? 1 : 0.5,
    sourceAmbiguity: ambiguities.length > 0 ? 0.3 : 0.8,
  });

  return {
    output,
    coverage,
    ambiguities,
    issues: finalIssues,
    confidence,
    repair,
  };
}

function sourceHashes(sources: SynthesisSource[]): Set<string> {
  const hashes = new Set<string>();
  for (const s of sources) hashes.add(s.sourceHash);
  return hashes;
}
