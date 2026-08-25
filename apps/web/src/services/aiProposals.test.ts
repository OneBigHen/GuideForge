import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityId } from '@guideforge/domain';
import { GUIDE_COMMAND_TYPES, applyCommands, freshGuideState } from '@guideforge/commands';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { generateGatewayProposals, getAiCapability } from './aiProposals';
import { createProposal } from './guideStore';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000' as EntityId;
const TASK_ID = '223e4567-e89b-42d3-a456-426614174000' as EntityId;
const STEP_ID = '323e4567-e89b-42d3-a456-426614174000' as EntityId;

function snapshotWithSteps(): GuideSnapshot {
  let seq = 0;
  const cmd = (commandType: string, payload: Record<string, unknown>) => {
    seq += 1;
    return {
      commandId: `cmd-${seq}`,
      commandType,
      actorId: 'test',
      guideId: GUIDE_ID,
      origin: 'user' as const,
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload,
    };
  };
  return applyCommands(freshGuideState(GUIDE_ID, 'AI mode test guide'), [
    cmd(GUIDE_COMMAND_TYPES.addTask, { taskId: TASK_ID, title: 'Task' }),
    cmd(GUIDE_COMMAND_TYPES.addStep, {
      taskId: TASK_ID,
      stepId: STEP_ID,
      title: 'Disconnect power before opening the housing.',
    }),
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('real mode never falls back to the offline adapter', () => {
  it('server 502 surfaces as a thrown error with no fake proposals created', async () => {
    const fetchMock = vi.fn(() => new Response(JSON.stringify({ error: 'model failed' }), { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateGatewayProposals(snapshotWithSteps(), { mode: 'real' }),
    ).rejects.toThrow(/Real AI request failed.*502/s);
  });

  it('a network failure in real mode throws instead of running fake rules', async () => {
    const fetchMock = vi.fn((): Promise<Response> => Promise.reject(new TypeError('fetch failed')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateGatewayProposals(snapshotWithSteps(), { mode: 'real' }),
    ).rejects.toThrow(/before reaching the server/);
  });

  it('real-mode success stores the server receipt verbatim', async () => {
    const receipt = {
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash-0731',
      inputTokens: 120,
      outputTokens: 40,
      cacheTokens: 0,
      providerCostUsd: 0.0002,
      latencyMs: 250,
      requestId: 'req-server-123',
      schemaVersion: '1',
      promptVersion: 'api-v1',
      createdAtIso: '2026-08-25T00:00:00.000Z',
    };
    const fetchMock = vi.fn((_url: unknown, init?: { headers?: Record<string, string> }) => {
      // The browser must never send or receive provider credentials.
      if (init?.headers && JSON.stringify(init.headers).toLowerCase().includes('authorization')) {
        return Promise.reject(new Error('client attempted to send credentials'));
      }
      const body = new TextEncoder().encode(
        JSON.stringify({
          proposals: [{ kind: 'warning', stepId: '323e4567-e89b-42d3-a456-426614174000', message: 'Check the breaker.' }],
          citations: [],
          sourceHash: 'a'.repeat(64),
          confidence: 0.8,
          receipt,
        }),
      );
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateGatewayProposals(snapshotWithSteps(), { mode: 'real' });
    expect(result.mode).toBe('real');
    expect(result.created).toBe(1);
    expect(result.receiptProvider).toBe('openrouter');
  });

  it('offline mode labels its receipts as deterministic fake output', async () => {
    // No server stub at all: even with fetch broken, offline mode works.
    vi.stubGlobal('fetch', vi.fn((): Promise<Response> => Promise.reject(new TypeError('fetch failed'))));
    const result = await generateGatewayProposals(snapshotWithSteps(), { mode: 'offline' });
    expect(result.mode).toBe('offline');
    expect(result.created).toBeGreaterThan(0);
    expect(result.receiptProvider).toBe('fake');
  });
});

describe('capability state', () => {
  it('reports unreachable honestly when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn((): Promise<Response> => Promise.reject(new TypeError('fetch failed'))));
    const capability = await getAiCapability();
    expect(capability.reachable).toBe(false);
    expect(capability.available).toBe(false);
  });

  it('passes through the server capability payload without secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ mode: 'real', provider: 'openrouter', model: 'server-selected', available: true }),
            { status: 200 },
          ),
        ),
      ),
    );
    const capability = await getAiCapability();
    expect(capability.reachable).toBe(true);
    expect(capability.mode).toBe('real');
    expect(capability.model).toBe('server-selected');
    expect(JSON.stringify(capability)).not.toMatch(/key|token/i);
  });

  it('createProposal persists optional cost metadata when provided', async () => {
    const id = await createProposal({
      guideId: '123e4567-e89b-42d3-a456-426614174000',
      commandType: 'guide/add-tool',
      payload: { stepId: '323e4567-e89b-42d3-a456-426614174000', toolId: '423e4567-e89b-42d3-a456-426614174000', name: 'Wrench' },
      summary: 'Add wrench',
      confidence: 0.5,
      sourceHash: null,
      receipt: {
        provider: 'fake',
        model: 'fake-rules-v1',
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 1,
        promptVersion: 'p',
        schemaVersion: '1',
        requestId: 'r',
        createdAtIso: '2026-08-25T00:00:00.000Z',
        providerCostUsd: 0,
      },
    });
    expect(id.length).toBeGreaterThan(0);
  });
});
