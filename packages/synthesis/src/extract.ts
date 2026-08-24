/**
 * Deterministic extraction: structure planning, claim extraction, hazards,
 * tools/parts, values/units, conditions, and verification.
 */
import type { ExtractionStep, ExtractionTask } from '@guideforge/ai-contracts';
import type { SynthesisRegion, SynthesisSource } from './types.js';

const HAZARD_MARKERS =
  /\b(warning|caution|danger|do not|never|must not|avoid|safety|protective|hazard|ensure.*ventilat)/i;
const TOOL_MARKERS = /\b(use|with|apply|tighten|remove|insert|install|adjust)\s+(a |an |the )?/i;
const VALUE_PATTERN =
  /\b(\d+(?:\.\d+)?)\s*(nm|µm|μm|mm|cm|m|ml|µl|ul|μl|l|g|kg|mg|°c|°f|n|rpm|v|a|w|kpa|bar|psi|s|min|h)\b/gi;
const CONDITION_MARKERS = /\b(if|when|unless|provided that|as soon as)\b/i;
const VERIFY_MARKERS = /\b(check|verify|confirm|inspect|ensure|test|measure|validate)\b/i;
const PART_MARKERS =
  /\b(assembly|component|module|gasket|o-ring|bracket|fastener|screw|nut|bolt|washer|valve|filter|seal|bearing|cap|plug|cover|housing|plate|clip|spring|sleeve|fitting)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Plan procedure structure: heading regions become tasks; non-heading
 * regions become step candidates grouped under the current task.
 * Returns the heading region ids consumed as task titles so coverage can
 * count them as used.
 */
export function planProcedureStructure(sources: SynthesisSource[]): {
  tasks: ExtractionTask[];
  regionsByTask: Map<string, SynthesisRegion[]>;
  headingRegionIds: string[];
} {
  const regionsByTask = new Map<string, SynthesisRegion[]>();
  const headingRegionIds: string[] = [];
  const tasks: ExtractionTask[] = [];

  for (const source of sources) {
    const ordered = [...source.regions].sort((a, b) => a.pageIndex - b.pageIndex);
    let currentTaskId: string | null = null;
    for (const region of ordered) {
      if (region.kind === 'heading') {
        currentTaskId = `task-${source.sourceHash.slice(0, 8)}-${region.regionId.slice(-6)}`;
        headingRegionIds.push(region.regionId);
        tasks.push({
          taskId: currentTaskId,
          title: region.excerpt.slice(0, 80) || 'Procedure',
          steps: [],
        });
        regionsByTask.set(currentTaskId, []);
        continue;
      }
      if (!currentTaskId) {
        currentTaskId = `task-${source.sourceHash.slice(0, 8)}-0`;
        tasks.push({ taskId: currentTaskId, title: 'Procedure', steps: [] });
        regionsByTask.set(currentTaskId, []);
      }
      regionsByTask.get(currentTaskId)!.push(region);
    }
  }

  if (tasks.length === 0 && sources.length > 0) {
    const first = sources[0]!;
    tasks.push({ taskId: `task-${first.sourceHash.slice(0, 8)}-0`, title: 'Procedure', steps: [] });
    regionsByTask.set(`task-${first.sourceHash.slice(0, 8)}-0`, first.regions);
  }

  return { tasks, regionsByTask, headingRegionIds };
}

/** Claim extraction: one step per region, grounded in a real citation. */
export function extractClaims(region: SynthesisRegion, taskId: string): ExtractionStep {
  const sentences = splitSentences(region.excerpt);
  const action =
    region.kind === 'table-row'
      ? `Process the row: ${region.excerpt.slice(0, 160)}`
      : region.excerpt.slice(0, 200) || 'Untitled step';

  const hazards = sentences.filter((s) => HAZARD_MARKERS.test(s)).slice(0, 3);
  const conditions = sentences
    .filter((s) => CONDITION_MARKERS.test(s))
    .map((s) => s.slice(0, 160))
    .slice(0, 3);
  const verificationSteps = sentences
    .filter((s) => VERIFY_MARKERS.test(s))
    .map((s) => s.slice(0, 160))
    .slice(0, 3);
  const tools = sentences
    .filter((s) => TOOL_MARKERS.test(s))
    .map((s) => s.slice(0, 80))
    .slice(0, 3);
  const parts = sentences
    .filter((s) => PART_MARKERS.test(s))
    .map((s) => s.slice(0, 80))
    .slice(0, 3);

  const values: { label: string; value: string; unit?: string }[] = [];
  for (const match of region.excerpt.matchAll(VALUE_PATTERN)) {
    const num = match[1]!;
    const unit = match[2]!.toLowerCase();
    const label = `${num} ${unit}`;
    // Invented-value rejection: keep a value only when its digits+unit appear
    // verbatim in the region (deterministic grounding).
    if (region.excerpt.toLowerCase().includes(`${num} ${unit}`.toLowerCase())) {
      if (!values.some((v) => v.label === label)) values.push({ label, value: num, unit });
    }
  }

  return {
    stepId: `step-${region.regionId.slice(-8)}`,
    taskId,
    action,
    warnings: hazards,
    prerequisites: [],
    tools,
    parts,
    values: values.slice(0, 4),
    conditions,
    verificationSteps,
    citations: [region.regionId],
  };
}
