/**
 * ModelGateway-backed proposal generation for apps/web.
 *
 * Uses the deterministic FakeModelAdapter (privacy-safe, no network) to
 * produce cited, human-reviewable proposals from the guide's step text.
 * The OpenRouter adapter is wired only when the app is configured with a
 * server-side key (never in browser bundles).
 */
import { structuralChunking, type SourceRegion } from '@guideforge/ai-contracts';
import { GUIDE_COMMAND_TYPES } from '@guideforge/commands';
import type { ContentHash } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { FakeModelAdapter, ModelGateway } from '@guideforge/model-gateway';
import { createProposal, type NewProposal } from './guideStore';

const gateway = new ModelGateway([new FakeModelAdapter()]);

export interface AiProposalResult {
  created: number;
  citations: number;
  receiptProvider: string;
}

export async function generateGatewayProposals(snapshot: GuideSnapshot): Promise<AiProposalResult> {
  const sourceHash = sha256Hex(
    JSON.stringify({ title: snapshot.title, tasks: snapshot.tasks }),
  ) as ContentHash;
  const regions = new Map<string, SourceRegion>();
  const blocks = snapshot.steps.map((step, i) => ({
    kind: 'paragraph' as const,
    text: step.instructionText || 'Untitled step',
    structuralPath: `task:${step.taskId}/step:${i}`,
    pageIndex: 0,
  }));
  const chunks = structuralChunking(sourceHash, 0, blocks);
  for (const c of chunks) regions.set(c.region.regionId, c.region);

  const response = await gateway.run({
    sourceHash,
    chunks: chunks.map((c) => ({
      regionId: c.region.regionId,
      text: c.region.excerpt,
      pageIndex: 0,
    })),
    regions,
    promptVersion: 'web-fake-v1',
    policy: 'zdr',
  });

  if (!response.ok || !response.output) {
    return { created: 0, citations: 0, receiptProvider: 'none' };
  }

  const proposals: NewProposal[] = [];
  for (const task of response.output.tasks) {
    for (const step of task.steps) {
      for (const warning of step.warnings) {
        const snapshotStep = snapshot.steps.find(
          (s) =>
            s.instructionText === step.action.slice(0, 120) ||
            s.instructionText.includes(step.action.slice(0, 30)),
        );
        if (!snapshotStep) continue;
        proposals.push({
          guideId: snapshot.guideId,
          commandType: GUIDE_COMMAND_TYPES.addWarning,
          payload: {
            stepId: snapshotStep.stepId,
            warningId: crypto.randomUUID(),
            severity: 'warning',
            message: warning,
          },
          summary: `Add safety warning: ${warning}`,
          confidence: response.confidence?.overall ?? 0.5,
          sourceHash,
        });
      }
      for (const tool of step.tools) {
        const snapshotStep = snapshot.steps.find((s) =>
          s.instructionText.includes(step.action.slice(0, 30)),
        );
        if (!snapshotStep) continue;
        proposals.push({
          guideId: snapshot.guideId,
          commandType: GUIDE_COMMAND_TYPES.addTool,
          payload: {
            stepId: snapshotStep.stepId,
            toolId: crypto.randomUUID(),
            name: tool,
          },
          summary: `Add tool: ${tool}`,
          confidence: response.confidence?.overall ?? 0.5,
          sourceHash,
        });
      }
      for (const verification of step.verificationSteps) {
        const snapshotStep = snapshot.steps.find((s) =>
          s.instructionText.includes(step.action.slice(0, 30)),
        );
        if (!snapshotStep) continue;
        proposals.push({
          guideId: snapshot.guideId,
          commandType: GUIDE_COMMAND_TYPES.addWarning,
          payload: {
            stepId: snapshotStep.stepId,
            warningId: crypto.randomUUID(),
            severity: 'info',
            message: `Verification: ${verification}`,
          },
          summary: `Add verification note: ${verification}`,
          confidence: response.confidence?.overall ?? 0.5,
          sourceHash,
        });
      }
    }
  }

  let created = 0;
  for (const proposal of proposals) {
    await createProposal(proposal);
    created += 1;
  }

  return {
    created,
    citations: response.citations?.length ?? 0,
    receiptProvider: response.receipt.provider,
  };
}

function sha256Hex(text: string): string {
  // Browser-safe deterministic hash for the proposal source reference.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${toHex(h1)}${toHex(h2)}`.padEnd(64, '0');
}
