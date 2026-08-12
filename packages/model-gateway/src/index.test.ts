import type { SourceRegion } from '@guideforge/ai-contracts';
import type { ContentHash } from '@guideforge/domain';
import { describe, expect, it } from 'vitest';
import {
  DeepSeekAdapter,
  DirectModelAdapter,
  FakeModelAdapter,
  ModelGateway,
  OpenRouterAdapter,
  getOpenRouterDeepSeekModelProfile,
  validateProviderBaseUrl,
  type ModelAdapter,
} from './index.js';

const HASH = 'a'.repeat(64) as ContentHash;

function regions(): Map<string, SourceRegion> {
  return new Map([
    [
      'reg-1',
      {
        regionId: 'reg-1',
        sourceHash: HASH,
        pageIndex: 0,
        structuralPath: 'h:1/p:1',
        excerpt: 'Disconnect power before opening the housing.',
        kind: 'paragraph',
      },
    ],
  ]);
}

function request() {
  return {
    sourceHash: HASH,
    chunks: [
      { regionId: 'reg-1', text: 'Disconnect power before opening the housing.', pageIndex: 0 },
    ],
    regions: regions(),
    promptVersion: 'v1',
    policy: 'default' as const,
  };
}

describe('ModelGateway with fake adapter', () => {
  it('produces a valid extraction with citations', async () => {
    const gateway = new ModelGateway([new FakeModelAdapter()]);
    const res = await gateway.run(request());
    expect(res.ok).toBe(true);
    expect(res.output?.tasks[0]?.steps[0]?.citations).toContain('reg-1');
    expect(res.citations).toHaveLength(1);
    expect(res.receipt.provider).toBe('fake');
  });

  it('rejects uncited actionable output', async () => {
    const gateway = new ModelGateway([new FakeModelAdapter()]);
    const res = await gateway.run({
      ...request(),
      chunks: [{ regionId: 'reg-unknown', text: 'Do the thing', pageIndex: 0 }],
      regions: regions(),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('uncited');
  });

  it('rejects zero-citation steps (every actionable step must cite a region)', async () => {
    // A custom adapter whose step carries no citations at all must be refused
    // even though no *unknown* region is referenced.
    const adapter: ModelAdapter = {
      provider: 'test',
      model: 'test-v1',
      available: true,
      extract() {
        return Promise.resolve({
          output: {
            schemaVersion: 1,
            guideId: 'g',
            tasks: [
              {
                taskId: 't1',
                title: 'T',
                steps: [
                  {
                    stepId: 's1',
                    taskId: 't1',
                    action: 'Do the thing',
                    warnings: [],
                    prerequisites: [],
                    tools: [],
                    parts: [],
                    values: [],
                    conditions: [],
                    verificationSteps: [],
                    citations: [],
                  },
                ],
              },
            ],
          },
          usage: {
            receiptId: 'r',
            provider: 'test',
            model: 'test-v1',
            attempts: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheTokens: 0,
            providerCostUsd: 0,
            latencyMs: 0,
            requestId: 'req',
            policy: 'default',
            sourceHash: null,
            schemaVersion: '1',
            promptVersion: 'v1',
            createdAtIso: new Date().toISOString(),
          },
        });
      },
    };
    const gateway = new ModelGateway([adapter]);
    const res = await gateway.run(request());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no valid citation');
  });

  it('routes ZDR policy through the privacy-safe fake adapter', async () => {
    const gateway = new ModelGateway([new FakeModelAdapter()]);
    const res = await gateway.run({ ...request(), policy: 'zdr' });
    expect(res.ok).toBe(true);
    expect(res.receipt.policy).toBe('zdr');
  });

  it('OpenRouter adapter is unavailable without a key', () => {
    const adapter = new OpenRouterAdapter({ apiKey: '' });
    expect(adapter.available).toBe(false);
  });

  it('OpenRouter sends the complete strict extraction schema and usage receipt', async () => {
    const adapter = new OpenRouterAdapter({
      apiKey: 'sk-or-test',
      model: 'deepseek/deepseek-v4-flash-0731',
      referer: 'http://localhost:1420',
      appName: 'GuideForge test',
    });
    const output = {
      schemaVersion: 1,
      guideId: '',
      tasks: [
        {
          taskId: 'task-1',
          title: 'Procedure',
          steps: [
            {
              stepId: 'step-1',
              taskId: 'task-1',
              action: 'Disconnect power.',
              warnings: [],
              prerequisites: [],
              tools: [],
              parts: [],
              values: [],
              conditions: [],
              verificationSteps: ['Confirm power is disconnected.'],
              citations: ['reg-1'],
              uncertaintyReason: null,
            },
          ],
        },
      ],
    };
    const originalFetch = globalThis.fetch;
    let captured: { headers: Headers; body: Record<string, unknown> } | undefined;
    globalThis.fetch = (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = {
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'deepseek/deepseek-v4-flash-0731',
            choices: [{ message: { content: JSON.stringify(output) } }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 40,
              prompt_cache_hit_tokens: 10,
              cost: 0.00001,
            },
          }),
          { status: 200 },
        ),
      );
    };
    try {
      const result = await adapter.extract(request());
      expect(result.output).toEqual(output);
      expect(result.usage.provider).toBe('openrouter');
      expect(result.usage.providerCostUsd).toBe(0.00001);
      expect(result.usage.cacheTokens).toBe(10);
      expect(captured?.headers.get('authorization')).toBe('Bearer sk-or-test');
      expect(captured?.headers.get('http-referer')).toBe('http://localhost:1420');
      expect(captured?.headers.get('x-openrouter-title')).toBe('GuideForge test');
      expect(captured?.body).toMatchObject({
        model: 'deepseek/deepseek-v4-flash-0731',
        provider: { require_parameters: true },
        reasoning: { exclude: true },
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'guideforge_extraction', strict: true },
        },
      });
      const schema = (
        captured?.body.response_format as {
          json_schema: { schema: { properties: Record<string, unknown> } };
        }
      ).json_schema.schema;
      expect(schema.properties.tasks).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('has a current pinned OpenRouter DeepSeek profile', () => {
    const profile = getOpenRouterDeepSeekModelProfile();
    expect(profile.id).toBe('deepseek/deepseek-v4-flash-0731');
    expect(profile.providerApiVersion).toBe('chat-completions-json-schema');
    expect(profile.inputCostUsdPerMillion).toBe(0.08);
  });

  it('direct adapter falls back to deterministic extraction when available', async () => {
    const gateway = new ModelGateway([new DirectModelAdapter('local-llama', true)]);
    const res = await gateway.run(request());
    expect(res.ok).toBe(true);
  });
});

describe('provider endpoint SSRF guard', () => {
  it('allows the documented provider host and canonicalizes its trailing slash', () => {
    expect(
      validateProviderBaseUrl('https://api.deepseek.com/', { allowedHosts: ['api.deepseek.com'] }),
    ).toBe('https://api.deepseek.com');
  });

  it('rejects non-HTTPS, private, credential-bearing, and unallowlisted endpoints', () => {
    expect(() =>
      validateProviderBaseUrl('http://evil.example', { allowedHosts: ['evil.example'] }),
    ).toThrow(/HTTPS/);
    expect(() => validateProviderBaseUrl('https://169.254.169.254')).toThrow(/private|allowlisted/);
    expect(() => validateProviderBaseUrl('https://user:pass@api.deepseek.com')).toThrow(
      /credentials/,
    );
    expect(
      () => new OpenRouterAdapter({ apiKey: 'test', baseUrl: 'https://evil.example' }),
    ).toThrow(/allowlisted/);
  });

  it('keeps loopback available only as an explicit local-provider seam', () => {
    expect(validateProviderBaseUrl('http://127.0.0.1:11434/', { allowLoopback: true })).toBe(
      'http://127.0.0.1:11434',
    );
    expect(() => validateProviderBaseUrl('http://127.0.0.1:11434')).toThrow(/loopback/);
  });
});

describe('no-credential offline behavior (Phase 00 truth baseline)', () => {
  it('gateway with no configured adapters reports explicit unavailability, never fabricates output', async () => {
    const gateway = new ModelGateway([]);
    const res = await gateway.run(request());
    expect(res.ok).toBe(false);
    expect(res.output).toBeUndefined();
    expect(res.error).toBeTruthy();
    expect(res.receipt.provider).toBe('gateway');
    expect(res.receipt.model).toBe('none');
  });

  it('gateway with only unavailable credential-bound adapters does not silently fall back', async () => {
    // Both adapters are credential-bound and configured without keys.
    const gateway = new ModelGateway([
      new DeepSeekAdapter({ apiKey: '' }),
      new OpenRouterAdapter({ apiKey: '' }),
    ]);
    const res = await gateway.run(request());
    expect(res.ok).toBe(false);
    expect(res.output).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('explicitly registers a deterministic local adapter when offline authoring is intended', async () => {
    // The offline authoring path is an explicit choice, not a silent fallback:
    // the gateway only produces output when a deterministic adapter is
    // registered and its receipt makes the provider visible.
    const gateway = new ModelGateway([new DirectModelAdapter('local-llama', true)]);
    const res = await gateway.run(request());
    expect(res.ok).toBe(true);
    // The direct adapter delegates to the deterministic fake adapter for
    // extraction, so the receipt reports the actual producing adapter.
    expect(res.receipt.provider).toBe('fake');
  });
});

describe('DeepSeek adapter', () => {
  it('is unavailable without a key and available with one', () => {
    expect(new DeepSeekAdapter({ apiKey: '' }).available).toBe(false);
    expect(new DeepSeekAdapter({ apiKey: 'sk-test' }).available).toBe(true);
  });

  it('uses the constructor-provided API key for requests (env ignored when set)', async () => {
    // Regression for the audit finding: the adapter previously read only
    // process.env.DEEPSEEK_API_KEY, silently dropping the constructor key.
    const adapter = new DeepSeekAdapter({
      apiKey: 'sk-constructor-key',
      model: 'deepseek-v4-flash',
    });
    const originalFetch = globalThis.fetch;
    const seen: { url: string; auth: string }[] = [];
    globalThis.fetch = (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: '',
        auth: String(
          init?.headers instanceof Headers
            ? (init.headers.get('authorization') ?? '')
            : Array.isArray(init?.headers)
              ? (init.headers.find(([k]) => k.toLowerCase() === 'authorization')?.[1] ?? '')
              : (init?.headers?.authorization ?? ''),
        ),
      });
      return Promise.resolve(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    };
    try {
      await adapter.extract(request());
    } catch {
      // The response has no choices, so extraction may throw; the assertion
      // that matters is which key was sent in the Authorization header.
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.auth).toBe('Bearer sk-constructor-key');
  });

  it('verifies the configured model against the official model listing', async () => {
    const adapter = new DeepSeekAdapter({ apiKey: 'sk-test', model: 'deepseek-v4-flash' });
    const result = await adapter.verifyModelProfile(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: 'deepseek-v4-flash', object: 'model' }] }), {
          status: 200,
        }),
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.checkedAtIso).toMatch(/T/);
  });

  it(
    'performs a live extraction when DEEPSEEK_API_KEY is set (skipped otherwise)',
    { timeout: 60_000 },
    async () => {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) {
        // Guard against accidental live calls in CI without a key.
        return;
      }
      const adapter = new DeepSeekAdapter({ apiKey: key, model: 'deepseek-v4-flash' });
      const gateway = new ModelGateway([adapter]);
      const res = await gateway.run(request());
      expect(res.ok).toBe(true);
      expect(res.output?.tasks.length).toBeGreaterThanOrEqual(0);
      expect(res.receipt.provider).toBe('deepseek');
    },
  );
});

describe('OpenRouter adapter', () => {
  it('uses the constructor-provided API key for requests (env ignored when set)', async () => {
    const adapter = new OpenRouterAdapter({
      apiKey: 'sk-or-constructor',
      model: 'anthropic/claude-sonnet-4.5',
    });
    const originalFetch = globalThis.fetch;
    const seen: { url: string; auth: string }[] = [];
    globalThis.fetch = (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: '',
        auth: String(
          init?.headers instanceof Headers
            ? (init.headers.get('authorization') ?? '')
            : Array.isArray(init?.headers)
              ? (init.headers.find(([k]) => k.toLowerCase() === 'authorization')?.[1] ?? '')
              : (init?.headers?.authorization ?? ''),
        ),
      });
      return Promise.resolve(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    };
    try {
      await adapter.extract(request());
    } catch {
      // Response has no choices; the assertion that matters is the header.
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.auth).toBe('Bearer sk-or-constructor');
  });
});
