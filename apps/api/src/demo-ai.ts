/**
 * Bounded anonymous demo AI seam.
 *
 * A stateless, strictly-capped path for public visitors:
 *  - request shape is allowlisted (fixed demo version, ≤12 short steps,
 *    no model/provider/prompt/URL fields — anything unknown is rejected);
 *  - Turnstile is verified server-side before budget is touched;
 *  - a kill switch and a global daily spend ceiling fail closed BEFORE the
 *    provider is called;
 *  - per-client quota lives in a persistent store (Postgres in production);
 *    the in-memory implementation exists only for tests/dev;
 *  - the route never writes owner canonical data and never mutates guides.
 */
import { DEFAULT_OPENROUTER_DEEPSEEK_MODEL } from '@guideforge/model-gateway';
import { createHash } from 'node:crypto';

export const PUBLIC_DEMO_AI_VERSION = 1;

/** Server-owned model allowlist for anonymous calls. Clients never pick. */
export const PUBLIC_DEMO_MODELS: ReadonlySet<string> = new Set([DEFAULT_OPENROUTER_DEEPSEEK_MODEL]);

export interface TurnstileDecision {
  ok: boolean;
  reason?: string;
}

export interface PublicDemoAiRequest {
  turnstileToken: string;
  /** Non-secret, browser-local identifier for quota correlation only. */
  demoClientId: string;
  demoVersion: number;
  steps: { stepId: string; instructionText: string }[];
}

export type PublicDemoAiValidation =
  { ok: true; request: PublicDemoAiRequest } | { ok: false; reason: string };

export interface PublicDemoAiLimits {
  /** Hard kill switch (`AI_PUBLIC_DEMO_ENABLED`). */
  enabled: boolean;
  maxSteps: number;
  maxStepCharacters: number;
  maxPayloadCharacters: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostPerRequestUsd: number;
  dailyBudgetUsd: number;
  /** Per-client calls inside the rolling window. */
  windowCalls: number;
  windowMs: number;
  model: string;
}

export function defaultPublicDemoAiLimits(
  overrides: Partial<PublicDemoAiLimits> = {},
): PublicDemoAiLimits {
  return {
    enabled: false,
    maxSteps: 12,
    maxStepCharacters: 1_500,
    maxPayloadCharacters: 16_000,
    // ~4 chars/token; validated pre-call against the provider ceiling.
    maxInputTokens: 3_000,
    maxOutputTokens: 800,
    maxCostPerRequestUsd: 0.02,
    dailyBudgetUsd: 2,
    windowCalls: 3,
    windowMs: 10 * 60_000,
    model: DEFAULT_OPENROUTER_DEEPSEEK_MODEL,
    ...overrides,
  };
}

/**
 * Strict structural validation of an untrusted body. Unknown fields do not
 * reach the provider: the caller forwards ONLY the normalized steps.
 */
export function validatePublicDemoRequest(value: unknown): PublicDemoAiValidation {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'body must be an object' };
  const body = value as Record<string, unknown>;

  if (typeof body.turnstileToken !== 'string' || body.turnstileToken.length === 0) {
    return { ok: false, reason: 'turnstile token required' };
  }
  if (body.turnstileToken.length > 4096) {
    return { ok: false, reason: 'turnstile token too long' };
  }
  if (
    typeof body.demoClientId !== 'string' ||
    body.demoClientId.length < 8 ||
    body.demoClientId.length > 128
  ) {
    return {
      ok: false,
      reason: 'demoClientId must be an 8-128 character browser-local identifier',
    };
  }
  if (body.demoVersion !== PUBLIC_DEMO_AI_VERSION) {
    return { ok: false, reason: `unsupported demoVersion (expected ${PUBLIC_DEMO_AI_VERSION})` };
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return { ok: false, reason: 'steps required' };
  }
  if (body.steps.length > 12) {
    return { ok: false, reason: 'too many steps (max 12)' };
  }

  let totalChars = 0;
  const steps = [];
  for (const raw of body.steps) {
    if (!raw || typeof raw !== 'object')
      return { ok: false, reason: 'each step must be an object' };
    const step = raw as Record<string, unknown>;
    if (typeof step.stepId !== 'string' || step.stepId.length === 0 || step.stepId.length > 128) {
      return { ok: false, reason: 'invalid stepId' };
    }
    if (typeof step.instructionText !== 'string') {
      return { ok: false, reason: 'instructionText must be a string' };
    }
    if (step.instructionText.length > 1_500) {
      return { ok: false, reason: 'step exceeds 1500 characters' };
    }
    totalChars += step.instructionText.length + step.stepId.length;
    // Only the two allowlisted fields survive normalization.
    steps.push({ stepId: step.stepId, instructionText: step.instructionText });
  }
  if (totalChars > 16_000) {
    return { ok: false, reason: 'payload too large' };
  }
  return {
    ok: true,
    request: {
      turnstileToken: body.turnstileToken,
      demoClientId: body.demoClientId,
      demoVersion: PUBLIC_DEMO_AI_VERSION,
      steps,
    },
  };
}

/** Hash a client identifier for quota correlation. Never reversible storage. */
export function hashClientIdentifier(demoId: string, coarseIp: string | undefined): string {
  return createHash('sha256')
    .update(`${demoId}|${coarseIp ?? ''}`)
    .digest('hex');
}

export interface QuotaDecision {
  allowed: boolean;
  remainingWindow: number;
  remainingTodayUsd: number;
  reason?: 'disabled' | 'quota-exceeded' | 'budget-exhausted';
}

export interface DemoAiQuotaStore {
  /**
   * Atomically reserve one call for `clientHash`. Called BEFORE the provider
   * so parallel bursts cannot overspend; failed provider calls still count
   * (documented trade-off: reservations are not refunded).
   */
  reserve(input: {
    clientHash: string;
    estimatedCostUsd: number;
    limits: PublicDemoAiLimits;
    nowMs: number;
  }): Promise<QuotaDecision>;
}

/** Fixed-window in-memory quota store (tests/dev only — not durable). */
export class InMemoryQuotaStore implements DemoAiQuotaStore {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private spentTodayUsd = 0;
  private dayKey = '';

  constructor(private readonly globalDailyBudgetUsd: number) {}

  reserve(input: {
    clientHash: string;
    estimatedCostUsd: number;
    limits: PublicDemoAiLimits;
    nowMs: number;
  }): Promise<QuotaDecision> {
    return Promise.resolve(this.reserveSync(input));
  }

  private reserveSync(input: {
    clientHash: string;
    estimatedCostUsd: number;
    limits: PublicDemoAiLimits;
    nowMs: number;
  }): QuotaDecision {
    const dayKey = new Date(input.nowMs).toISOString().slice(0, 10);
    if (dayKey !== this.dayKey) {
      this.dayKey = dayKey;
      this.spentTodayUsd = 0;
    }

    const window = this.windows.get(input.clientHash);
    const fresh =
      !window || input.nowMs - window.start >= input.limits.windowMs
        ? { start: input.nowMs, count: 0 }
        : window;

    // Fail closed: if this reservation would exceed the remaining daily
    // budget, reject before any provider work.
    if (!input.limits.enabled) {
      return {
        allowed: false,
        remainingWindow: Math.max(0, input.limits.windowCalls - fresh.count),
        remainingTodayUsd: Math.max(0, this.globalDailyBudgetUsd - this.spentTodayUsd),
        reason: 'disabled',
      };
    }
    if (this.spentTodayUsd + input.estimatedCostUsd > this.globalDailyBudgetUsd) {
      return {
        allowed: false,
        remainingWindow: Math.max(0, input.limits.windowCalls - fresh.count),
        remainingTodayUsd: 0,
        reason: 'budget-exhausted',
      };
    }
    if (fresh.count >= input.limits.windowCalls) {
      return {
        allowed: false,
        remainingWindow: 0,
        remainingTodayUsd: Math.max(0, this.globalDailyBudgetUsd - this.spentTodayUsd),
        reason: 'quota-exceeded',
      };
    }

    fresh.count += 1;
    this.windows.set(input.clientHash, fresh);
    this.spentTodayUsd += input.estimatedCostUsd;
    return {
      allowed: true,
      remainingWindow: Math.max(0, input.limits.windowCalls - fresh.count),
      remainingTodayUsd: Math.max(0, this.globalDailyBudgetUsd - this.spentTodayUsd),
    };
  }
}

interface QuotaRow {
  window_start: Date;
  calls: number;
  spent_today_usd: string | number;
  day_key: string;
}

/**
 * Durable per-client quota store backed by PostgreSQL (same database as the
 * control plane). Survives service restarts so public spend limits cannot be
 * reset by restarting a container. Only hashed identifiers are stored —
 * never prompts, tokens, or raw IPs.
 */
export class PostgresQuotaStore implements DemoAiQuotaStore {
  private initialized = false;

  constructor(
    private readonly pool: {
      connect(): Promise<{
        query(sql: string, values?: unknown[]): Promise<{ rows: QuotaRow[] }>;
        release(): void;
      }>;
    },
    private readonly globalDailyBudgetUsd: number,
  ) {}

  async reserve(input: {
    clientHash: string;
    estimatedCostUsd: number;
    limits: PublicDemoAiLimits;
    nowMs: number;
  }): Promise<QuotaDecision> {
    const client = await this.pool.connect();
    try {
      if (!this.initialized) {
        await client.query(`CREATE TABLE IF NOT EXISTS demo_ai_quota (
            client_hash TEXT PRIMARY KEY,
            window_start TIMESTAMPTZ NOT NULL,
            calls INTEGER NOT NULL DEFAULT 0,
            spent_today_usd NUMERIC NOT NULL DEFAULT 0,
            day_key DATE NOT NULL,
            last_request TIMESTAMPTZ
          )`);
        this.initialized = true;
      }
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT window_start, calls, spent_today_usd, day_key FROM demo_ai_quota WHERE client_hash = $1',
        [input.clientHash],
      );
      const row = existing.rows[0];
      const nowDate = new Date(input.nowMs);
      const dayKey = nowDate.toISOString().slice(0, 10);
      const current =
        row && dayKey === String(row.day_key)
          ? {
              start: new Date(row.window_start).getTime(),
              count: Number(row.calls),
              spent: Number(row.spent_today_usd),
            }
          : { start: input.nowMs, count: 0, spent: 0 };

      const rolled =
        !row ||
        dayKey !== String(row.day_key) ||
        input.nowMs - current.start >= input.limits.windowMs;

      let decision: QuotaDecision;
      if (!input.limits.enabled) {
        decision = {
          allowed: false,
          remainingWindow: Math.max(0, input.limits.windowCalls - (rolled ? 0 : current.count)),
          remainingTodayUsd: Math.max(0, this.globalDailyBudgetUsd - current.spent),
          reason: 'disabled',
        };
      } else if (current.spent + input.estimatedCostUsd > this.globalDailyBudgetUsd) {
        decision = {
          allowed: false,
          remainingWindow: Math.max(0, input.limits.windowCalls - (rolled ? 0 : current.count)),
          remainingTodayUsd: 0,
          reason: 'budget-exhausted',
        };
      } else if (!rolled && current.count >= input.limits.windowCalls) {
        decision = {
          allowed: false,
          remainingWindow: 0,
          remainingTodayUsd: Math.max(0, this.globalDailyBudgetUsd - current.spent),
          reason: 'quota-exceeded',
        };
      } else {
        const nextCount = rolled ? 1 : current.count + 1;
        const nextSpent = (rolled ? 0 : current.spent) + input.estimatedCostUsd;
        await client.query(
          `INSERT INTO demo_ai_quota
             (client_hash, window_start, calls, spent_today_usd, day_key, last_request)
           VALUES ($1, $2, $3, $4, $5, $2)
           ON CONFLICT (client_hash) DO UPDATE SET
             window_start = $2, calls = $3, spent_today_usd = $4,
             day_key = $5, last_request = $2`,
          [
            input.clientHash,
            new Date(input.nowMs).toISOString(),
            nextCount,
            nextSpent.toFixed(6),
            dayKey,
          ],
        );
        decision = {
          allowed: true,
          remainingWindow: Math.max(0, input.limits.windowCalls - nextCount),
          remainingTodayUsd: Math.max(0, this.globalDailyBudgetUsd - nextSpent),
        };
      }
      await client.query('COMMIT');
      return decision;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

export interface PublicDemoProviderResult {
  proposals: {
    kind: 'warning' | 'tool' | 'verification';
    stepId: string;
    message?: string;
    name?: string;
  }[];
  citations: { regionId: string; pageIndex: number; excerptHash: string; claimRef: string }[];
  receipt: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    providerCostUsd: number;
    requestId: string;
  };
}

export interface PublicDemoAiContext {
  limits: PublicDemoAiLimits;
  verifyTurnstile: (token: string, remoteIp: string | undefined) => Promise<TurnstileDecision>;
  quotaStore: DemoAiQuotaStore;
  /**
   * Runs the fixed server-allowlisted model over the normalized steps.
   * Implemented by the API with the real adapter; injected here so every
   * guard can be proven to fire before any provider work happens.
   */
  runModel: (
    request: PublicDemoAiRequest,
    limits: PublicDemoAiLimits,
  ) => Promise<PublicDemoProviderResult>;
}

export type PublicDemoAiOutcome =
  | { status: 'ok'; response: PublicDemoProviderResult & { quota: { remainingWindow: number } } }
  | { status: 'rejected'; httpStatus: number; reason: string };

/**
 * The single entry point for anonymous AI. Guard order is deliberate:
 * validation → Turnstile → kill switch/budget/quota → provider. Every
 * rejection happens before `runModel` is invoked.
 */
export async function runPublicDemoAi(
  value: unknown,
  context: PublicDemoAiContext,
  remoteIp: string | undefined,
): Promise<PublicDemoAiOutcome> {
  // 1. Shape validation (cheap, no side effects).
  const validation = validatePublicDemoRequest(value);
  if (!validation.ok) {
    return { status: 'rejected', httpStatus: 400, reason: validation.reason };
  }

  // 2. Server-verified Turnstile — no LLM budget may be touched otherwise.
  const decision = await context.verifyTurnstile(validation.request.turnstileToken, remoteIp);
  if (!decision.ok) {
    return {
      status: 'rejected',
      httpStatus: 403,
      reason: `turnstile rejected: ${decision.reason ?? 'unknown'}`,
    };
  }

  // 3. Pre-flight cost estimate must fit under the per-request ceiling.
  const estimatedInputTokens = Math.ceil(
    validation.request.steps.reduce((n, s) => n + s.instructionText.length + s.stepId.length, 0) /
      4,
  );
  if (estimatedInputTokens > context.limits.maxInputTokens) {
    return {
      status: 'rejected',
      httpStatus: 413,
      reason: 'estimated input tokens exceed the demo cap',
    };
  }
  if (!context.limits.enabled) {
    // Kill switch checked before reservation AND before the provider.
    return { status: 'rejected', httpStatus: 503, reason: 'public demo AI is disabled' };
  }

  // 4. Reserve quota + budget atomically (still before the provider).
  // Correlation key = browser-local id + coarse IP; the raw token and prompt
  // text are never stored for quota purposes.
  const clientHash = hashClientIdentifier(validation.request.demoClientId, remoteIp);
  const reservation = await context.quotaStore.reserve({
    clientHash,
    estimatedCostUsd: context.limits.maxCostPerRequestUsd,
    limits: context.limits,
    nowMs: Date.now(),
  });
  if (!reservation.allowed) {
    return {
      status: 'rejected',
      httpStatus: 429,
      reason:
        reservation.reason === 'disabled'
          ? 'public demo AI is disabled'
          : reservation.reason === 'budget-exhausted'
            ? 'demo daily AI budget exhausted'
            : 'demo AI rate limit reached; try again later',
    };
  }

  // 5. Provider call with the fixed server-side model only.
  let result: PublicDemoProviderResult;
  try {
    result = await context.runModel(validation.request, context.limits);
  } catch (err) {
    throw new Error(
      `demo AI provider failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (result.receipt.model !== context.limits.model) {
    return {
      status: 'rejected',
      httpStatus: 502,
      reason: 'provider returned a non-allowlisted model',
    };
  }

  return {
    status: 'ok',
    response: {
      ...result,
      quota: { remainingWindow: reservation.remainingWindow },
    },
  };
}
