/**
 * Server-side Cloudflare Turnstile verification.
 *
 * The browser widget alone proves nothing: every anonymous AI request must
 * pass Siteverify here BEFORE any LLM budget is consumed. Verification fails
 * closed — timeouts, network errors, and malformed responses all count as
 * rejections. Test keys are honored automatically by Cloudflare when the
 * configured secret is one of their published test secrets.
 */
import type { TurnstileDecision } from './demo-ai.js';

const DEFAULT_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare-published always-passes test secret (siteverify recognizes it). */
export const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';

export interface TurnstileVerifierOptions {
  secretKey: string;
  /** Override only for tests; production always uses the real endpoint. */
  siteverifyUrl?: string;
  expectedHostname?: string;
  expectedAction?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
}

/**
 * Verify one Turnstile token for one remote IP. Never throws — every failure
 * path returns `{ ok: false }` with a stable machine-readable reason.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp: string | undefined,
  options: TurnstileVerifierOptions,
): Promise<TurnstileDecision> {
  if (!options.secretKey) {
    return { ok: false, reason: 'turnstile-not-configured' };
  }
  // Reject malformed tokens before any network call.
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    return { ok: false, reason: 'invalid-token' };
  }

  const body = new URLSearchParams({ secret: options.secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    const fetcher = options.fetcher ?? fetch;
    const res = await fetcher(options.siteverifyUrl ?? DEFAULT_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: `siteverify-http-${res.status}` };
    }
    let parsed: SiteverifyResponse;
    try {
      parsed = (await res.json()) as SiteverifyResponse;
    } catch {
      return { ok: false, reason: 'siteverify-invalid-response' };
    }
    if (parsed.success !== true) {
      return {
        ok: false,
        reason: parsed['error-codes']?.join(',') ?? 'verification-failed',
      };
    }
    if (options.expectedHostname && parsed.hostname !== options.expectedHostname) {
      return { ok: false, reason: 'hostname-mismatch' };
    }
    if (options.expectedAction && parsed.action !== options.expectedAction) {
      return { ok: false, reason: 'action-mismatch' };
    }
    return { ok: true };
  } catch (err) {
    // Timeouts (abort) and network failures both fail CLOSED.
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, reason: aborted ? 'siteverify-timeout' : 'siteverify-unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
