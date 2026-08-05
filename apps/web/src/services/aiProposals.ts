/**
 * AI proposal generation for apps/web.
 *
 * Prefers the server-side control plane (`/api/guides/:id/ai-proposals`),
 * which runs the real DeepSeek adapter with the API key server-side (never in
 * the browser). Falls back to the deterministic local gateway only when the
 * API is unreachable, so authoring remains useful offline.
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

interface ServerProposal {
  kind: 'warning' | 'tool' | 'verification';
  stepId: string;
  message?: string;
  name?: string;
}

interface ServerAiResponse {
  proposals: ServerProposal[];
  citations: number;
  receipt: { provider: string; model: string };
}

export async function generateGatewayProposals(snapshot: GuideSnapshot): Promise<AiProposalResult> {
  // Try the real server (DeepSeek) first.
  const server = await tryServerProposals(snapshot);
  if (server) return server;

  // Offline fallback: deterministic local gateway.
  return generateLocalProposals(snapshot);
}

async function tryServerProposals(snapshot: GuideSnapshot): Promise<AiProposalResult | null> {
  try {
    const res = await fetch(`/api/guides/${snapshot.guideId}/ai-proposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        steps: snapshot.steps.map((s) => ({
          stepId: s.stepId,
          instructionText: s.instructionText,
        })),
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ServerAiResponse;

    let created = 0;
    for (const p of body.proposals) {
      const step = snapshot.steps.find((s) => s.stepId === p.stepId);
      if (!step) continue;
      const base = {
        guideId: snapshot.guideId,
        confidence: 0.7,
        sourceHash: sha256Hex(snapshot.title) as ContentHash,
      };
      if (p.kind === 'tool' && p.name) {
        await createProposal({
          ...base,
          commandType: GUIDE_COMMAND_TYPES.addTool,
          payload: { stepId: step.stepId, toolId: crypto.randomUUID(), name: p.name },
          summary: `Add tool: ${p.name}`,
        });
        created += 1;
      } else if (p.message) {
        await createProposal({
          ...base,
          commandType: GUIDE_COMMAND_TYPES.addWarning,
          payload: {
            stepId: step.stepId,
            warningId: crypto.randomUUID(),
            severity: p.kind === 'verification' ? 'info' : 'warning',
            message: p.kind === 'verification' ? `Verification: ${p.message}` : p.message,
          },
          summary:
            p.kind === 'verification'
              ? `Add verification note: ${p.message}`
              : `Add safety warning: ${p.message}`,
        });
        created += 1;
      }
    }
    return { created, citations: body.citations, receiptProvider: body.receipt.provider };
  } catch {
    return null;
  }
}

async function generateLocalProposals(snapshot: GuideSnapshot): Promise<AiProposalResult> {
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
