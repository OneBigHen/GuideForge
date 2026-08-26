/**
 * Browser client for the bounded anonymous demo AI seam.
 *
 * - A random, non-secret, browser-local identifier is used ONLY for quota
 *   correlation; it never authenticates anything and is resettable.
 * - The Turnstile token comes from the widget rendered with the server's
 *   public site key (surfaced via /api/ai/capability).
 * - Results become reviewable LOCAL proposals on the visitor's own demo copy
 *   after explicit acceptance. No owner/canonical endpoint is ever called.
 */
import type { NewProposal } from './guideStore';
import { createProposal } from './guideStore';

const DEMO_ID_STORAGE_KEY = 'gf-demo-client-id';

export function getDemoClientId(): string {
  let id = localStorage.getItem(DEMO_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEMO_ID_STORAGE_KEY, id);
  }
  return id;
}

/** Explicit rotation — visitors can reset their quota correlation identity. */
export function rotateDemoClientId(): string {
  const id = crypto.randomUUID();
  localStorage.setItem(DEMO_ID_STORAGE_KEY, id);
  return id;
}

interface DemoAiServerResult {
  proposals: {
    kind: 'warning' | 'tool' | 'verification';
    stepId: string;
    message?: string;
    name?: string;
  }[];
  citations: {
    regionId: string;
    pageIndex: number;
    excerptHash: string;
    claimRef: string;
  }[];
  receipt: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    providerCostUsd: number;
    requestId: string;
  };
  quota: { remainingWindow: number };
}

export interface RequestDemoAiInput {
  guideId: string;
  /** Steps from the visitor's local demo copy (already length-capped). */
  steps: { stepId: string; instructionText: string }[];
  turnstileToken: string;
}

export async function requestDemoAi(input: RequestDemoAiInput): Promise<DemoAiServerResult> {
  const res = await fetch('/api/demo/ai-proposals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      turnstileToken: input.turnstileToken,
      demoClientId: getDemoClientId(),
      demoVersion: 1,
      steps: input.steps,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `demo AI request failed: HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
    );
  }
  return (await res.json()) as DemoAiServerResult;
}

/**
 * Convert a demo-AI response into pending LOCAL proposals on the visitor's
 * own guide. This is the only mutation path — it writes browser-local Dexie
 * rows and applies through the normal command bus after explicit acceptance.
 */
export async function storeDemoProposalsLocally(
  result: DemoAiServerResult,
  options: { guideId: string; sourceHash: string },
): Promise<number> {
  let created = 0;
  for (const proposal of result.proposals) {
    const base = {
      guideId: options.guideId,
      confidence: 0.6,
      sourceHash: options.sourceHash,
      citations: result.citations.map((citation) => ({
        ...citation,
        sourceHash: options.sourceHash,
      })),
      receipt: {
        provider: result.receipt.provider,
        model: `${result.receipt.model} (demo)`,
        inputTokens: result.receipt.inputTokens,
        outputTokens: result.receipt.outputTokens,
        latencyMs: 0,
        promptVersion: 'demo-v1',
        schemaVersion: '1',
        requestId: result.receipt.requestId,
        createdAtIso: new Date().toISOString(),
        providerCostUsd: result.receipt.providerCostUsd,
      },
    } satisfies Pick<
      NewProposal,
      'guideId' | 'confidence' | 'sourceHash' | 'citations' | 'receipt'
    >;

    const payload =
      proposal.kind === 'tool'
        ? {
            commandType: 'guide/add-tool',
            summaryText: `Add tool: ${proposal.name ?? ''}`,
            commandPayload: {
              stepId: proposal.stepId,
              toolId: crypto.randomUUID(),
              name: proposal.name ?? '',
            },
          }
        : proposal.kind === 'verification'
          ? {
              commandType: 'guide/add-warning',
              summaryText: `Add verification note: ${proposal.message ?? ''}`,
              commandPayload: {
                stepId: proposal.stepId,
                warningId: crypto.randomUUID(),
                severity: 'info',
                message: `Verification: ${proposal.message ?? ''}`,
              },
            }
          : {
              commandType: 'guide/add-warning',
              summaryText: `Add safety warning: ${proposal.message ?? ''}`,
              commandPayload: {
                stepId: proposal.stepId,
                warningId: crypto.randomUUID(),
                severity: 'warning',
                message: proposal.message ?? '',
              },
            };

    await createProposal({
      ...base,
      commandType: payload.commandType,
      summary: payload.summaryText,
      payload: payload.commandPayload,
    });
    created += 1;
  }
  return created;
}
