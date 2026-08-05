import type { SourceRegion } from '@guideforge/ai-contracts';
import type { ContentHash } from '@guideforge/domain';
import { describe, expect, it } from 'vitest';
import { DirectModelAdapter, FakeModelAdapter, ModelGateway, OpenRouterAdapter } from './index.js';

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
