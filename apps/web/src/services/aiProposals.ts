/**
 * AI proposal generation for apps/web.
 *
 * Modes are explicit — behavior is never derived from fetch success:
 *  - `real`: only the server-side provider path (`/api/guides/:id/ai-proposals`)
 *    runs, with the API key server-side. Any server failure is surfaced to the
 *    user and NEVER substituted with the offline adapter.
 *  - `offline`: deterministic rules adapter runs locally and every receipt it
 *    produces is visibly labeled as offline/deterministic.
 *
 * Capability state comes from `/api/ai/capability` (no secrets); the browser
 * never learns a key, concrete model id, or provider URL.
 */
import { structuralChunking, type SourceRegion } from '@guideforge/ai-contracts';
import { GUIDE_COMMAND_TYPES } from '@guideforge/commands';
import { sha256Hex, type ContentHash } from '@guideforge/domain';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { FakeModelAdapter, ModelGateway } from '@guideforge/model-gateway';
import { createProposal, type NewProposal } from './guideStore';

const gateway = new ModelGateway([new FakeModelAdapter()]);

/** Explicit AI operating mode. There is intentionally no silent `auto`. */
export type AiMode = 'real' | 'offline';

export interface GenerateOptions {
  mode: AiMode;
}

export interface AiCapability {
  mode: 'real' | 'offline';
  /** Provider name when real; null in offline mode. */
  provider: string | null;
  model: 'server-selected' | null;
  available: boolean;
  /** Bounded anonymous demo surface state (site key is public by design). */
  publicDemo?: { enabled: boolean; siteKey: string | null };
}

export interface AiProposalResult {
  created: number;
  citations: number;
  receiptProvider: string;
  mode: AiMode;
}

interface ServerProposal {
  kind: 'warning' | 'tool' | 'verification';
  stepId: string;
  message?: string;
  name?: string;
}

interface ServerCitation {
  regionId: string;
  pageIndex: number;
  excerptHash: string;
  claimRef: string;
}

interface ServerReceipt {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  providerCostUsd: number;
  latencyMs: number;
  requestId: string;
  schemaVersion: string;
  promptVersion: string;
  createdAtIso: string;
}

interface ServerAiResponse {
  proposals: ServerProposal[];
  citations: ServerCitation[];
  sourceHash: string;
  confidence: number | null;
  receipt: ServerReceipt;
}

/**
 * Fetch server AI capability. Returns `reachable: false` when the API cannot
 * be contacted so callers can label offline generation honestly.
 */
export async function getAiCapability(): Promise<AiCapability & { reachable: boolean }> {
  try {
    const res = await fetch('/api/ai/capability', { credentials: 'include' });
    if (!res.ok)
      return { mode: 'offline', provider: null, model: null, available: false, reachable: false };
    const body = (await res.json()) as AiCapability;
    return { ...body, reachable: true };
  } catch {
    return { mode: 'offline', provider: null, model: null, available: false, reachable: false };
  }
}

/**
 * Generate proposals with an explicit mode. In `real` mode a server failure
 * throws — the fake adapter is never consulted (no silent fallback).
 */
export async function generateGatewayProposals(
  snapshot: GuideSnapshot,
  options: GenerateOptions,
): Promise<AiProposalResult> {
  if (options.mode === 'real') {
    // Real mode: the server path is the ONLY path.
    const server = await tryServerProposals(snapshot);
    if (server) return { ...server, mode: 'real' };
    throw new Error(
      'Real AI request failed. The server-side provider could not complete this request ' +
        '(it may be unreachable, unconfigured, rate-limited, or erroring). No offline output was substituted.',
    );
  }
  // Offline mode: deterministic local gateway, visibly labeled.
  const local = await generateLocalProposals(snapshot);
  return { ...local, mode: 'offline' };
}

async function tryServerProposals(
  snapshot: GuideSnapshot,
): Promise<Omit<AiProposalResult, 'mode'> | null> {
  let res: Response;
  try {
    res = await fetch(`/api/guides/${snapshot.guideId}/ai-proposals`, {
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
  } catch (err) {
    throw new Error(
      `Real AI request failed before reaching the server: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Real AI request failed: HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
    );
  }
  const body = (await res.json()) as ServerAiResponse;

  let created = 0;
  const receipt = {
    provider: body.receipt.provider,
    model: body.receipt.model,
    inputTokens: body.receipt.inputTokens,
    outputTokens: body.receipt.outputTokens,
    latencyMs: body.receipt.latencyMs,
    promptVersion: body.receipt.promptVersion,
    schemaVersion: body.receipt.schemaVersion,
    requestId: body.receipt.requestId,
    createdAtIso: body.receipt.createdAtIso,
    cacheTokens: body.receipt.cacheTokens,
    providerCostUsd: body.receipt.providerCostUsd,
  };
  for (const p of body.proposals) {
    const step = snapshot.steps.find((s) => s.stepId === p.stepId);
    if (!step) continue;
    const base = {
      guideId: snapshot.guideId,
      confidence: body.confidence ?? 0.7,
      sourceHash: body.sourceHash,
      citations: body.citations,
      receipt,
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
  return { created, citations: body.citations.length, receiptProvider: body.receipt.provider };
}

async function generateLocalProposals(
  snapshot: GuideSnapshot,
): Promise<Omit<AiProposalResult, 'mode'>> {
  const sourceHash = sha256Hex(
    new TextEncoder().encode(JSON.stringify({ title: snapshot.title, tasks: snapshot.tasks })),
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
  const localReceipt = {
    provider: response.receipt.provider,
    model: response.receipt.model,
    inputTokens: response.receipt.inputTokens,
    outputTokens: response.receipt.outputTokens,
    latencyMs: response.receipt.latencyMs,
    promptVersion: response.receipt.promptVersion,
    schemaVersion: response.receipt.schemaVersion,
    requestId: response.receipt.requestId,
    createdAtIso: response.receipt.createdAtIso,
  };
  const localBase = {
    guideId: snapshot.guideId,
    sourceHash,
    citations: response.citations ?? [],
    receipt: localReceipt,
  };
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
          ...localBase,
          commandType: GUIDE_COMMAND_TYPES.addWarning,
          payload: {
            stepId: snapshotStep.stepId,
            warningId: crypto.randomUUID(),
            severity: 'warning',
            message: warning,
          },
          summary: `Add safety warning: ${warning}`,
          confidence: response.confidence?.overall ?? 0.5,
        });
      }
      for (const tool of step.tools) {
        const snapshotStep = snapshot.steps.find((s) =>
          s.instructionText.includes(step.action.slice(0, 30)),
        );
        if (!snapshotStep) continue;
        proposals.push({
          ...localBase,
          commandType: GUIDE_COMMAND_TYPES.addTool,
          payload: {
            stepId: snapshotStep.stepId,
            toolId: crypto.randomUUID(),
            name: tool,
          },
          summary: `Add tool: ${tool}`,
          confidence: response.confidence?.overall ?? 0.5,
        });
      }
      for (const verification of step.verificationSteps) {
        const snapshotStep = snapshot.steps.find((s) =>
          s.instructionText.includes(step.action.slice(0, 30)),
        );
        if (!snapshotStep) continue;
        proposals.push({
          ...localBase,
          commandType: GUIDE_COMMAND_TYPES.addWarning,
          payload: {
            stepId: snapshotStep.stepId,
            warningId: crypto.randomUUID(),
            severity: 'info',
            message: `Verification: ${verification}`,
          },
          summary: `Add verification note: ${verification}`,
          confidence: response.confidence?.overall ?? 0.5,
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
