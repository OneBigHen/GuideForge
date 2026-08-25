/**
 * AI capability endpoint + provider endpoint configuration tests.
 *
 * These tests intentionally avoid database access: the capability route reads
 * only deployment config, and the pg Pool connects lazily, so no PostgreSQL
 * instance is required.
 */
import { describe, expect, it } from 'vitest';
import { buildServer, configuredProviderEndpoint, type ApiConfig } from './index.js';

function baseConfig(): ApiConfig {
  return {
    // Never dialed in these tests (no query runs).
    databaseUrl: 'postgres://guideforge:guideforge@localhost:5/unused',
    sessionSecret: 'capability-test-session',
    roomTicketSecret: 'capability-test-tickets',
    logLevel: 'silent',
  };
}

describe('AI capability endpoint', () => {
  it('reports offline with no provider details when no key is configured', async () => {
    const app = await buildServer(baseConfig());
    try {
      const res = await app.inject({ method: 'GET', url: '/api/ai/capability' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ mode: string; provider: string | null; model: string; available: boolean }>();
      expect(body.mode).toBe('offline');
      expect(body.provider).toBeNull();
      expect(body.model).toBe('server-selected');
      expect(body.available).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('reports real mode when a server-side OpenRouter key is configured', async () => {
    const app = await buildServer({ ...baseConfig(), openRouterApiKey: 'sk-test' });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/ai/capability' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ mode: string; provider: string | null; model: string; available: boolean }>();
      expect(body.mode).toBe('real');
      expect(body.provider).toBe('openrouter');
      expect(body.available).toBe(true);
      // No credential material may appear in the capability payload. The
      // public Turnstile *site* key is safe by design; secrets are not.
      expect(res.body).not.toContain('sk-test');
      expect(res.body.toLowerCase()).not.toContain('secret');
    } finally {
      await app.close();
    }
  });

  it('reports real deepseek mode when only a DeepSeek key is configured', async () => {
    const app = await buildServer({ ...baseConfig(), deepSeekApiKey: 'sk-ds-test' });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/ai/capability' });
      const body = res.json<{ mode: string; provider: string | null; model: string; available: boolean }>();
      expect(body.mode).toBe('real');
      expect(body.provider).toBe('deepseek');
      expect(res.body).not.toContain('sk-ds-test');
    } finally {
      await app.close();
    }
  });
});

describe('provider endpoint configuration', () => {
  it('defaults to the OpenRouter API host when no gateway is configured', () => {
    expect(
      configuredProviderEndpoint({ ...baseConfig(), openRouterApiKey: 'sk-test' }),
    ).toBe('https://openrouter.ai/api/v1');
  });

  it('routes through the Cloudflare AI Gateway when account + gateway ids are set', () => {
    expect(
      configuredProviderEndpoint({
        ...baseConfig(),
        openRouterApiKey: 'sk-test',
        cloudflareAiGatewayAccountId: 'acct123',
        cloudflareAiGatewayId: 'guideforge',
      }),
    ).toBe('https://gateway.ai.cloudflare.com/v1/acct123/guideforge/openrouter');
  });

  it('returns null without credentials regardless of gateway settings', () => {
    expect(
      configuredProviderEndpoint({
        ...baseConfig(),
        cloudflareAiGatewayAccountId: 'acct123',
        cloudflareAiGatewayId: 'guideforge',
      }),
    ).toBeNull();
  });
});
