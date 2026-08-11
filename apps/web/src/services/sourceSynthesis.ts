/**
 * Source-grounded procedure synthesis for apps/web (Phase 06).
 *
 * Reads ingested sources (Phase 05 Source Studio) from Dexie, runs the
 * deterministic @guideforge/synthesis planner, and turns the validated plan
 * into human-reviewable proposals. AI proposes; acceptance applies the
 * proposals through the normal command bus.
 */
import type { ExtractionOutput } from '@guideforge/ai-contracts';
import { GUIDE_COMMAND_TYPES } from '@guideforge/commands';
import type { ContentHash, EntityId } from '@guideforge/domain';
import type { SourceRecord } from '@guideforge/storage-web';
import {
  synthesizeProcedure,
  type SynthesisPlan,
  type SynthesisSource,
} from '@guideforge/synthesis';
import { createProposal } from './guideStore';
import type { SourceStudio } from './sourceStudio';

export interface SynthesisRunResult {
  proposalsCreated: number;
  citedRegions: number;
  coverageRatio: number;
  ambiguities: number;
  repairs: string[];
  droppedActionable: boolean;
  taskCount: number;
  stepCount: number;
  ok: boolean;
  issues: string[];
}

export interface RegionRef {
  regionId: string;
  pageIndex: number;
  sourceHash: ContentHash;
  excerptHash: string;
}

/** Build the region reference map the planner's citations point at. */
function buildRegionRefs(sources: SourceRecord[]): Map<string, RegionRef> {
  const refs = new Map<string, RegionRef>();
  for (const record of sources) {
    const sourceHash = record.sha256 as ContentHash;
    for (const region of record.regions) {
      refs.set(region.regionId, {
        regionId: region.regionId,
        pageIndex: region.pageIndex,
        sourceHash,
        excerptHash: hashExcerpt(region.excerpt),
      });
    }
  }
  return refs;
}

function hashExcerpt(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + '-' + text.length.toString(16);
}

function toSynthesisSource(record: SourceRecord): SynthesisSource {
  return {
    sourceHash: record.sha256 as ContentHash,
    originalFilename: record.originalFilename,
    detectedType: record.detectedType,
    sizeBytes: record.sizeBytes,
    regions: record.regions.map((r) => ({
      regionId: r.regionId,
      sourceHash: record.sha256 as ContentHash,
      pageIndex: r.pageIndex,
      structuralPath: r.structuralPath,
      excerpt: r.excerpt,
      kind: normalizeKind(r.kind),
    })),
  };
}

function normalizeKind(kind: string): SynthesisSource['regions'][number]['kind'] {
  switch (kind) {
    case 'heading':
    case 'list-item':
    case 'table-row':
    case 'figure-caption':
    case 'warning':
      return kind;
    default:
      return 'paragraph';
  }
}

/**
 * Synthesize procedure proposals from the guide's ingested sources and store
 * them as pending proposals. Requires at least one ready source with regions.
 */
export async function synthesizeFromSources(
  session: { guideId: string },
  studio: SourceStudio,
): Promise<SynthesisRunResult> {
  const rows = await studio.db.sources.where('guideId').equals(session.guideId).toArray();
  const withRegions = rows.filter((r) => r.regions.length > 0 && r.status !== 'failed');
  if (withRegions.length === 0) {
    return {
      proposalsCreated: 0,
      citedRegions: 0,
      coverageRatio: 0,
      ambiguities: 0,
      repairs: [],
      droppedActionable: false,
      taskCount: 0,
      stepCount: 0,
      ok: true,
      issues: ['no ready sources with regions to synthesize from'],
    };
  }

  const plan = synthesizeProcedure({
    guideId: session.guideId,
    sources: withRegions.map(toSynthesisSource),
  });
  const regionRefs = buildRegionRefs(withRegions);

  let created = 0;
  for (const proposal of planToProposals(session.guideId, plan, regionRefs)) {
    await createProposal(proposal);
    created += 1;
  }

  return {
    proposalsCreated: created,
    citedRegions: plan.coverage.citedRegions,
    coverageRatio: plan.coverage.coverageRatio,
    ambiguities: plan.ambiguities.length,
    repairs: plan.repair.repairs,
    droppedActionable: plan.repair.droppedActionable,
    taskCount: plan.output.tasks.length,
    stepCount: plan.output.tasks.reduce((n, t) => n + t.steps.length, 0),
    ok: plan.issues.every((i) => i.severity !== 'error'),
    issues: plan.issues.map((i) => i.message),
  };
}

type ProposalInput = Parameters<typeof createProposal>[0];

/** Convert a validated plan into pending proposals (never auto-applied). */
export function planToProposals(
  guideId: string,
  plan: SynthesisPlan,
  regionRefs: Map<string, RegionRef>,
): ProposalInput[] {
  const proposals: ProposalInput[] = [];
  const receipt = {
    provider: 'synthesis-local',
    model: 'synthesis-rules-v1',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    promptVersion: 'phase06-v1',
    schemaVersion: '1',
    requestId: crypto.randomUUID(),
    createdAtIso: new Date().toISOString(),
  };
  const confidence = plan.confidence.overall;
  const sourceHash = firstSourceHash(regionRefs);

  for (const task of plan.output.tasks) {
    const taskId = crypto.randomUUID() as EntityId;
    proposals.push({
      guideId,
      commandType: GUIDE_COMMAND_TYPES.addTask,
      payload: { taskId, title: task.title },
      summary: `Create task: ${task.title}`,
      confidence,
      sourceHash,
      citations: [],
      receipt,
    });
    for (const step of task.steps) {
      const stepId = crypto.randomUUID() as EntityId;
      const citations = stepCitations(step, regionRefs);
      proposals.push({
        guideId,
        commandType: GUIDE_COMMAND_TYPES.addStep,
        payload: { taskId, stepId, title: step.action },
        summary: `Create step: ${step.action.slice(0, 80)}`,
        confidence,
        sourceHash,
        citations,
        receipt,
      });
      for (const warning of step.warnings) {
        proposals.push({
          guideId,
          commandType: GUIDE_COMMAND_TYPES.addWarning,
          payload: {
            stepId,
            warningId: crypto.randomUUID(),
            severity: 'warning',
            message: warning,
          },
          summary: `Add safety warning: ${warning.slice(0, 80)}`,
          confidence,
          sourceHash,
          citations,
          receipt,
        });
      }
      for (const tool of step.tools) {
        proposals.push({
          guideId,
          commandType: GUIDE_COMMAND_TYPES.addTool,
          payload: { stepId, toolId: crypto.randomUUID(), name: tool.slice(0, 80) },
          summary: `Add tool: ${tool.slice(0, 80)}`,
          confidence,
          sourceHash,
          citations,
          receipt,
        });
      }
      for (const part of step.parts) {
        proposals.push({
          guideId,
          commandType: GUIDE_COMMAND_TYPES.addPart,
          payload: { stepId, partId: crypto.randomUUID(), name: part.slice(0, 80), quantity: 1 },
          summary: `Add part: ${part.slice(0, 80)}`,
          confidence,
          sourceHash,
          citations,
          receipt,
        });
      }
      for (const value of step.values) {
        proposals.push({
          guideId,
          commandType: GUIDE_COMMAND_TYPES.addValue,
          payload: {
            stepId,
            valueId: crypto.randomUUID(),
            label: value.label,
            value: value.value,
            ...(value.unit ? { unit: value.unit } : {}),
          },
          summary: `Set value ${value.label} on step`,
          confidence,
          sourceHash,
          citations,
          receipt,
        });
      }
      for (const condition of step.conditions) {
        proposals.push({
          guideId,
          commandType: GUIDE_COMMAND_TYPES.addCondition,
          payload: { stepId, conditionId: crypto.randomUUID(), text: condition },
          summary: `Add condition: ${condition.slice(0, 80)}`,
          confidence,
          sourceHash,
          citations,
          receipt,
        });
      }
      for (const verification of step.verificationSteps) {
        proposals.push({
          guideId,
          commandType: GUIDE_COMMAND_TYPES.addVerification,
          payload: { stepId, verificationId: crypto.randomUUID(), text: verification },
          summary: `Add verification: ${verification.slice(0, 80)}`,
          confidence,
          sourceHash,
          citations,
          receipt,
        });
      }
    }
  }
  return proposals;
}

function stepCitations(
  step: ExtractionOutput['tasks'][number]['steps'][number],
  regionRefs: Map<string, RegionRef>,
): { regionId: string; pageIndex: number; excerptHash: string; claimRef: string }[] {
  return step.citations.map((regionId) => {
    const ref = regionRefs.get(regionId);
    return {
      regionId,
      pageIndex: ref?.pageIndex ?? 0,
      excerptHash: ref?.excerptHash ?? '',
      claimRef: step.stepId,
    };
  });
}

function firstSourceHash(regionRefs: Map<string, RegionRef>): string | null {
  const first = regionRefs.values().next().value;
  return first ? first.sourceHash : null;
}
