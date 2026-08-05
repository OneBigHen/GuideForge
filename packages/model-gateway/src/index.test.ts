import type { SourceRegion } from '@guideforge/ai-contracts';
import type { ContentHash } from '@guideforge/domain';
import { describe, expect, it } from 'vitest';
import {
  DeepSeekAdapter,
  DirectModelAdapter,
  FakeModelAdapter,
  ModelGateway,
  OpenRouterAdapter,
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

  it('direct adapter falls back to deterministic extraction when available', async () => {
    const gateway = new ModelGateway([new DirectModelAdapter('local-llama', true)]);
    const res = await gateway.run(request());
    expect(res.ok).toBe(true);
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
