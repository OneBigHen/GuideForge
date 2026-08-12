import type { ContentHash } from '@guideforge/domain';
import {
  DeepSeekAdapter,
  getOpenRouterDeepSeekModelProfile,
  ModelGateway,
  OpenRouterAdapter,
} from '@guideforge/model-gateway';
import { describe, expect, it } from 'vitest';
import { SynthesisGateway, type SynthesisSource } from './index.js';

const HASH_A = 'a'.repeat(64) as ContentHash;
const HASH_B = 'b'.repeat(64) as ContentHash;

function sources(): SynthesisSource[] {
  return [
    {
      sourceHash: HASH_A,
      originalFilename: 'manual-a.txt',
      detectedType: 'text/plain',
      sizeBytes: 10,
      regions: [
        {
          regionId: 'a-1',
          sourceHash: HASH_A,
          pageIndex: 0,
          structuralPath: 'p:1',
          excerpt: 'Disconnect power before opening the housing.',
          kind: 'paragraph',
        },
      ],
    },
    {
      sourceHash: HASH_B,
      originalFilename: 'manual-b.txt',
      detectedType: 'text/plain',
      sizeBytes: 10,
      regions: [
        {
          regionId: 'b-1',
          sourceHash: HASH_B,
          pageIndex: 1,
          structuralPath: 'p:2',
          excerpt: 'Tighten the retaining screw to 5 nm.',
          kind: 'paragraph',
        },
      ],
    },
  ];
}

function modelOutput(values: unknown[] = []): object {
  return {
    schemaVersion: 1,
    guideId: 'wrong-guide-is-normalized',
    tasks: [
      {
        taskId: 'task-1',
        title: 'Procedure',
        steps: [
          {
            stepId: 'step-1',
            taskId: 'task-1',
            action: 'Disconnect power before opening the housing.',
            warnings: [],
            prerequisites: [],
            tools: [],
            parts: [],
            values,
            conditions: [],
            verificationSteps: ['Confirm the housing is de-energized.'],
            citations: ['a-1'],
          },
        ],
      },
    ],
  };
}

function gatewayWithOutput(
  output: object,
  calls: { count: number },
  provider: 'deepseek' | 'openrouter' = 'deepseek',
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: RequestInfo | URL, _init?: RequestInit) => {
    calls.count += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 40,
            total_tokens: 140,
            prompt_cache_hit_tokens: 0,
          },
        }),
        { status: 200 },
      ),
    );
  };
  const adapter =
    provider === 'openrouter'
      ? new OpenRouterAdapter({
          apiKey: 'test-key',
          model: 'deepseek/deepseek-v4-flash-0731',
        })
      : new DeepSeekAdapter({ apiKey: 'test-key', model: 'deepseek-v4-flash' });
  return {
    synthesis: new SynthesisGateway({
      mode: 'deepseek',
      modelGateway: new ModelGateway([adapter]),
      ...(provider === 'openrouter'
        ? { provider, profile: getOpenRouterDeepSeekModelProfile() }
        : {}),
      cache: new Map(),
    }),
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe('SynthesisGateway', () => {
  it('keeps offline rules explicit and separate from DeepSeek', async () => {
    const result = await new SynthesisGateway({ mode: 'offline-rules' }).run({
      guideId: 'g',
      sources: sources(),
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('offline-rules');
    expect(result.receipt.provider).toBe('synthesis-local');
    expect(result.receipt.model).toBe('synthesis-rules-v1');
  });

  it('runs DeepSeek over multiple source hashes with citations and a receipt', async () => {
    const calls = { count: 0 };
    const adapter = gatewayWithOutput(modelOutput(), calls);
    try {
      const result = await adapter.synthesis.run({ guideId: 'g', sources: sources() });
      expect(result.ok).toBe(true);
      expect(result.mode).toBe('deepseek');
      expect(result.receipt.provider).toBe('deepseek');
      expect(result.receipt.sourceHashes).toEqual([HASH_A, HASH_B]);
      expect(result.plan?.output.guideId).toBe('g');
      expect(result.plan?.coverage.citedRegions).toBe(1);
      expect(result.receipt.providerCostUsd).toBeGreaterThan(0);
      expect(calls.count).toBe(1);
    } finally {
      adapter.restore();
    }
  });

  it('records OpenRouter as the transport for an OpenRouter-hosted DeepSeek model', async () => {
    const calls = { count: 0 };
    const adapter = gatewayWithOutput(modelOutput(), calls, 'openrouter');
    try {
      const result = await adapter.synthesis.run({ guideId: 'g', sources: sources() });
      expect(result.ok).toBe(true);
      expect(result.receipt.provider).toBe('openrouter');
      expect(result.receipt.model).toBe('deepseek/deepseek-v4-flash-0731');
      expect(calls.count).toBe(1);
    } finally {
      adapter.restore();
    }
  });

  it('serves a successful identical request from the bounded cache', async () => {
    const calls = { count: 0 };
    const adapter = gatewayWithOutput(modelOutput(), calls);
    try {
      const request = { guideId: 'g', sources: sources() };
      await adapter.synthesis.run(request);
      const second = await adapter.synthesis.run(request);
      expect(second.ok).toBe(true);
      expect(second.receipt.cacheHit).toBe(true);
      expect(calls.count).toBe(1);
    } finally {
      adapter.restore();
    }
  });

  it('repairs an invented numeric value without allowing it into the plan', async () => {
    const calls = { count: 0 };
    const adapter = gatewayWithOutput(
      modelOutput([{ label: 'torque', value: '999', unit: 'nm' }]),
      calls,
    );
    try {
      const result = await adapter.synthesis.run({ guideId: 'g', sources: sources() });
      expect(result.ok).toBe(true);
      expect(result.plan?.output.tasks[0]?.steps[0]?.values).toEqual([]);
      expect(result.plan?.repair.repairs.length).toBeGreaterThan(0);
    } finally {
      adapter.restore();
    }
  });

  it('fails before calling DeepSeek when the input budget is exceeded', async () => {
    const calls = { count: 0 };
    const adapter = gatewayWithOutput(modelOutput(), calls);
    try {
      const result = await new SynthesisGateway({
        mode: 'deepseek',
        modelGateway: new ModelGateway([
          new DeepSeekAdapter({ apiKey: 'test-key', model: 'deepseek-v4-flash' }),
        ]),
        budget: { maxInputTokens: 1 },
      }).run({ guideId: 'g', sources: sources() });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('input budget exceeded');
      expect(calls.count).toBe(0);
    } finally {
      adapter.restore();
    }
  });

  it('turns an unexpected provider exception into a failed receipt', async () => {
    const result = await new SynthesisGateway({
      mode: 'deepseek',
      modelGateway: {
        run: () => Promise.reject(new Error('provider connection reset')),
      } as unknown as ModelGateway,
    }).run({ guideId: 'g', sources: sources() });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('provider connection reset');
    expect(result.receipt.status).toBe('failed');
    expect(result.receipt.error).toBe('provider connection reset');
  });
});
