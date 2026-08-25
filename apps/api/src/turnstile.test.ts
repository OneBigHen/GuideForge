import { describe, expect, it, vi } from 'vitest';
import { TURNSTILE_TEST_SECRET, verifyTurnstile } from './turnstile.js';

const OK_BODY = {
  success: true,
  hostname: 'guides.henning.rodeo',
  action: 'demo-ai',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(new TextEncoder().encode(JSON.stringify(value)), { status });
}

describe('server-side Turnstile verification', () => {
  it('accepts a successful verification', async () => {
    const fetcher = vi.fn((_url: unknown, _init?: { body?: string }) =>
      Promise.resolve(jsonResponse(OK_BODY)),
    );
    const decision = await verifyTurnstile('tok', '203.0.113.9', {
      secretKey: 'secret',
      fetcher: fetcher as unknown as typeof fetch,
      expectedHostname: 'guides.henning.rodeo',
      expectedAction: 'demo-ai',
    });
    expect(decision.ok).toBe(true);
    // remoteip is forwarded for edge/IP correlation
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain('remoteip=203.0.113.9');
  });

  it('rejects an unsuccessful verification and reports error codes', async () => {
    const providerCalled = vi.fn();
    const fetcher = vi.fn(() =>
      Promise.resolve(jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] })),
    );
    const decision = await verifyTurnstile('used-token', undefined, {
      secretKey: 'secret',
      fetcher,
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain('invalid-input-response');
    expect(providerCalled).not.toHaveBeenCalled();
  });

  it('rejects hostname mismatch where configured', async () => {
    const fetcher = vi.fn((_url: unknown, _init?: unknown) =>
      Promise.resolve(jsonResponse(OK_BODY)),
    );
    const decision = await verifyTurnstile('tok', undefined, {
      secretKey: 'secret',
      fetcher,
      expectedHostname: 'evil.example',
    });
    expect(decision).toMatchObject({ ok: false, reason: 'hostname-mismatch' });
  });

  it('rejects empty or oversized tokens before any network call', async () => {
    const fetcher = vi.fn();
    expect((await verifyTurnstile('', undefined, { secretKey: 's', fetcher })).ok).toBe(false);
    expect(
      (
        await verifyTurnstile('x'.repeat(5000), undefined, {
          secretKey: 's',
          fetcher,
        })
      ).ok,
    ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('times out Siteverify safely and fails closed', async () => {
    const fetcher = vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    });
    const decision = await verifyTurnstile('tok', undefined, {
      secretKey: 'secret',
      fetcher: fetcher as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(decision).toMatchObject({ ok: false, reason: 'siteverify-timeout' });
  });

  it('fails closed when Siteverify itself errors', async () => {
    const fetcher = vi.fn((): Promise<Response> => Promise.reject(new TypeError('dns fail')));
    const decision = await verifyTurnstile('tok', undefined, {
      secretKey: 'secret',
      fetcher,
    });
    expect(decision).toMatchObject({ ok: false, reason: 'siteverify-unreachable' });
  });

  it('rejects when the secret is not configured (fail closed)', async () => {
    const decision = await verifyTurnstile('tok', undefined, {
      secretKey: '',
      fetcher: vi.fn(),
    });
    expect(decision).toMatchObject({ ok: false, reason: 'turnstile-not-configured' });
  });

  it('exports the Cloudflare test secret constant for automated runs', () => {
    expect(TURNSTILE_TEST_SECRET.startsWith('1x')).toBe(true);
  });
});
