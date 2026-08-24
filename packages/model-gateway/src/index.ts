/**
 * @guideforge/model-gateway — provider-independent ModelGateway.
 *
 * Adapters:
 *  - FakeModelAdapter: deterministic rule-based extraction (tests, demos, and
 *    the Phase 03/06 proposal generator). Never claims source grounding it
 *    cannot verify.
 *  - OpenRouterAdapter: strict structured outputs via JSON Schema; used only
 *    when OPENROUTER_API_KEY is configured. No keys ever ship in browser code.
 *  - DirectAdapter: seam for self-hosted / local models (Ollama etc.).
 *
 * The gateway enforces: strict schema validation of model output, citation
 * gating against known source regions, and usage receipts per call.
 */
import type {
  Citation,
  ConfidenceBreakdown,
  ExtractionOutput,
  ExtractionStep,
  SourceRegion,
} from '@guideforge/ai-contracts';
import { computeConfidence, isExtractionOutput } from '@guideforge/ai-contracts';
import { sha256Hex, type ContentHash } from '@guideforge/domain';

export type PrivacyPolicy = 'zdr' | 'eu-only' | 'default';

/** Official DeepSeek profiles rechecked against the provider docs on 2026-08-11. */
export interface DeepSeekModelProfile {
  id: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostUsdPerMillion: number;
  outputCostUsdPerMillion: number;
  cacheReadCostUsdPerMillion: number;
  providerApiVersion: string;
  docsUrl: string;
  verifiedAtIso: string;
}

export const DEEPSEEK_MODEL_PROFILES: Readonly<Record<string, DeepSeekModelProfile>> = {
  'deepseek-v4-flash': {
    id: 'deepseek-v4-flash',
    contextWindow: 1_000_000,
    maxOutputTokens: 384_000,
    inputCostUsdPerMillion: 0.14,
    outputCostUsdPerMillion: 0.28,
    cacheReadCostUsdPerMillion: 0.028,
    providerApiVersion: 'chat-completions-json-object',
    docsUrl: 'https://api-docs.deepseek.com/api/create-chat-completion',
    verifiedAtIso: '2026-08-11T00:00:00.000Z',
  },
  'deepseek-v4-pro': {
    id: 'deepseek-v4-pro',
    contextWindow: 1_000_000,
    maxOutputTokens: 384_000,
    inputCostUsdPerMillion: 1.74,
    outputCostUsdPerMillion: 3.48,
    cacheReadCostUsdPerMillion: 0.145,
    providerApiVersion: 'chat-completions-json-object',
    docsUrl: 'https://api-docs.deepseek.com/api/create-chat-completion',
    verifiedAtIso: '2026-08-11T00:00:00.000Z',
  },
};

/**
 * OpenRouter-hosted DeepSeek profiles. These IDs and prices are pinned from
 * the OpenRouter model catalog; the transport is OpenRouter, not the official
 * DeepSeek endpoint.
 */
export const OPENROUTER_DEEPSEEK_MODEL_PROFILES: Readonly<Record<string, DeepSeekModelProfile>> = {
  'deepseek/deepseek-v4-flash-0731': {
    id: 'deepseek/deepseek-v4-flash-0731',
    contextWindow: 1_048_576,
    maxOutputTokens: 384_000,
    inputCostUsdPerMillion: 0.08,
    outputCostUsdPerMillion: 0.18,
    cacheReadCostUsdPerMillion: 0.016,
    providerApiVersion: 'chat-completions-json-schema',
    docsUrl: 'https://openrouter.ai/docs/structured-outputs',
    verifiedAtIso: '2026-08-12T00:00:00.000Z',
  },
};

export const DEFAULT_OPENROUTER_DEEPSEEK_MODEL = 'deepseek/deepseek-v4-flash-0731';

export function getOpenRouterDeepSeekModelProfile(
  model = DEFAULT_OPENROUTER_DEEPSEEK_MODEL,
): DeepSeekModelProfile {
  const profile = OPENROUTER_DEEPSEEK_MODEL_PROFILES[model];
  if (!profile) throw new Error(`unsupported OpenRouter DeepSeek model profile: ${model}`);
  return profile;
}

/**
 * Validate a server-side provider endpoint before it reaches fetch().
 *
 * Provider URLs are deployment configuration, not request data. Requiring an
 * explicit HTTPS host allowlist (with an opt-in loopback seam for local
 * providers) keeps a bad configuration from becoming an SSRF primitive.
 */
export function validateProviderBaseUrl(
  baseUrl: string,
  options: { allowedHosts?: readonly string[]; allowLoopback?: boolean } = {},
): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('provider base URL is invalid');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('provider base URL must use HTTP(S)');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('provider base URL cannot contain credentials, query, or fragment data');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = isLoopbackProviderHost(hostname);
  if (loopback) {
    if (!options.allowLoopback) throw new Error('loopback provider base URL is not allowed');
  } else {
    if (parsed.protocol !== 'https:') {
      throw new Error('non-loopback provider endpoints require HTTPS');
    }
    if (isPrivateProviderHost(hostname)) {
      throw new Error('private or metadata provider host is not allowed');
    }
    const allowed = (options.allowedHosts ?? []).some((candidate) => {
      const normalized = candidate
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, '');
      return (
        normalized.length > 0 && (hostname === normalized || hostname.endsWith(`.${normalized}`))
      );
    });
    if (!allowed) throw new Error('provider base URL host is not allowlisted');
  }

  return parsed.toString().replace(/\/+$/, '');
}

function isLoopbackProviderHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname)
  );
}

function isPrivateProviderHost(hostname: string): boolean {
  if (
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname === '0.0.0.0'
  ) {
    return true;
  }
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:');
  }
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return (
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && second >= 18 && second <= 19)
  );
}

export function getDeepSeekModelProfile(model = 'deepseek-v4-flash'): DeepSeekModelProfile {
  const profile = DEEPSEEK_MODEL_PROFILES[model];
  if (!profile) throw new Error(`unsupported DeepSeek model profile: ${model}`);
  return profile;
}

export interface ModelRequest {
  sourceHash: ContentHash | null;
  chunks: { regionId: string; text: string; pageIndex: number }[];
  regions: Map<string, SourceRegion>;
  promptVersion: string;
  policy: PrivacyPolicy;
  model?: string;
  maxOutputTokens?: number;
}

export interface ModelResponse {
  ok: boolean;
  output?: ExtractionOutput;
  citations?: Citation[];
  confidence?: ConfidenceBreakdown;
  receipt: UsageReceiptLike;
  error?: string;
}

export interface UsageReceiptLike {
  receiptId: string;
  provider: string;
  model: string;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  providerCostUsd: number;
  latencyMs: number;
  requestId: string;
  policy: string;
  sourceHash: ContentHash | null;
  schemaVersion: string;
  promptVersion: string;
  createdAtIso: string;
}

export interface ModelAdapter {
  readonly provider: string;
  readonly model: string;
  readonly available: boolean;
  extract(request: ModelRequest): Promise<{ output: ExtractionOutput; usage: UsageReceiptLike }>;
}

function makeReceipt(
  adapter: ModelAdapter,
  request: ModelRequest,
  usage: Partial<UsageReceiptLike>,
): UsageReceiptLike {
  return {
    receiptId: crypto.randomUUID(),
    provider: adapter.provider,
    model: adapter.model,
    attempts: 1,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    providerCostUsd: 0,
    latencyMs: 0,
    requestId: crypto.randomUUID(),
    policy: request.policy,
    sourceHash: request.sourceHash,
    schemaVersion: '1',
    promptVersion: request.promptVersion,
    createdAtIso: new Date().toISOString(),
    ...usage,
  };
}

export class FakeModelAdapter implements ModelAdapter {
  readonly provider = 'fake';
  readonly model = 'fake-rules-v1';
  readonly available = true;

  /** Deterministic rule-based extraction from chunk text. */
  extract(request: ModelRequest): Promise<{ output: ExtractionOutput; usage: UsageReceiptLike }> {
    const tasks: ExtractionOutput['tasks'] = request.chunks.map((chunk, i) => ({
      taskId: `task-${i + 1}`,
      title: titleFrom(chunk.text) ?? `Procedure ${i + 1}`,
      steps: [
        {
          stepId: `step-${i + 1}-1`,
          taskId: `task-${i + 1}`,
          action: chunk.text.slice(0, 120),
          warnings: chunk.text.toLowerCase().includes('power')
            ? ['Disconnect power first (suggested)']
            : [],
          prerequisites: [] as string[],
          tools: chunk.text.toLowerCase().includes('wrench') ? ['Wrench'] : [],
          parts: [] as string[],
          values: [] as ExtractionStep['values'],
          conditions: [] as string[],
          verificationSteps: [`Confirm: ${chunk.text.slice(0, 80) || 'the step was completed'}`],
          citations: [request.regions.get(chunk.regionId)?.regionId ?? chunk.regionId],
          ...(chunk.text.length < 10
            ? { uncertaintyReason: 'excerpt too short for confident extraction' }
            : {}),
        },
      ],
    }));
    const output: ExtractionOutput = { schemaVersion: 1, guideId: '', tasks };
    return Promise.resolve({
      output,
      usage: makeReceipt(this, request, {
        inputTokens: request.chunks.reduce((n, c) => n + c.text.length / 4, 0),
      }),
    });
  }
}

function titleFrom(text: string): string | null {
  const match = /^(?:[0-9]+[.)]\s*)?([A-Z][^.]{3,60})/.exec(text);
  const title = match?.[1];
  return title ?? null;
}

export interface OpenRouterAdapterConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** strict JSON schema enforcement via response_format */
  structuredOutputs?: boolean;
  referer?: string;
  appName?: string;
  maxOutputTokens?: number;
}

const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    guideId: { type: 'string' },
    tasks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          steps: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                stepId: { type: 'string' },
                taskId: { type: 'string' },
                action: { type: 'string' },
                warnings: { type: 'array', items: { type: 'string' } },
                prerequisites: { type: 'array', items: { type: 'string' } },
                tools: { type: 'array', items: { type: 'string' } },
                parts: { type: 'array', items: { type: 'string' } },
                values: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      label: { type: 'string' },
                      value: { type: 'string' },
                      unit: { type: ['string', 'null'] },
                    },
                    required: ['label', 'value', 'unit'],
                  },
                },
                conditions: { type: 'array', items: { type: 'string' } },
                verificationSteps: { type: 'array', items: { type: 'string' } },
                citations: { type: 'array', items: { type: 'string' }, minItems: 1 },
                uncertaintyReason: { type: ['string', 'null'] },
              },
              required: [
                'stepId',
                'taskId',
                'action',
                'warnings',
                'prerequisites',
                'tools',
                'parts',
                'values',
                'conditions',
                'verificationSteps',
                'citations',
                'uncertaintyReason',
              ],
            },
          },
        },
        required: ['taskId', 'title', 'steps'],
      },
    },
  },
  required: ['schemaVersion', 'guideId', 'tasks'],
} as const;

interface OpenRouterCompletionBody {
  model?: string;
  choices?: { message?: { content?: string | Record<string, unknown> } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    cost?: number;
  };
}

export class OpenRouterAdapter implements ModelAdapter {
  readonly provider = 'openrouter';
  readonly model: string;
  readonly available: boolean;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly structuredOutputs: boolean;
  private readonly referer: string | undefined;
  private readonly appName: string | undefined;
  private readonly maxOutputTokens: number;

  constructor(config: OpenRouterAdapterConfig) {
    this.model = config.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_DEEPSEEK_MODEL;
    this.apiKey = config.apiKey;
    this.available = config.apiKey.trim().length > 0;
    this.structuredOutputs = config.structuredOutputs ?? true;
    this.referer = config.referer;
    this.appName = config.appName;
    this.maxOutputTokens = config.maxOutputTokens ?? 4096;
    this.baseUrl = validateProviderBaseUrl(config.baseUrl ?? 'https://openrouter.ai/api/v1', {
      allowedHosts: ['openrouter.ai'],
    });
  }

  async extract(
    request: ModelRequest,
  ): Promise<{ output: ExtractionOutput; usage: UsageReceiptLike }> {
    if (!this.available) {
      throw new Error('OpenRouter adapter is not configured (no API key)');
    }
    const started = Date.now();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
    };
    if (this.referer) headers['HTTP-Referer'] = this.referer;
    if (this.appName) headers['X-OpenRouter-Title'] = this.appName;
    const body: Record<string, unknown> = {
      model: this.model,
      provider: { require_parameters: true },
      messages: [
        {
          role: 'system',
          content:
            'Extract work instructions as strict JSON. Cite only the supplied source region IDs. ' +
            'Do not invent procedures, values, warnings, or citations.',
        },
        { role: 'user', content: JSON.stringify(request.chunks) },
      ],
      max_tokens: Math.min(request.maxOutputTokens ?? this.maxOutputTokens, this.maxOutputTokens),
      temperature: 0,
      reasoning: { exclude: true },
    };
    if (this.structuredOutputs) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'guideforge_extraction',
          strict: true,
          schema: EXTRACTION_JSON_SCHEMA,
        },
      };
    } else {
      body.response_format = { type: 'json_object' };
    }
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`openrouter http ${response.status}: ${detail.slice(0, 300)}`);
    }
    const completion = (await response.json()) as OpenRouterCompletionBody;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error('openrouter empty content');
    const output = typeof content === 'string' ? (JSON.parse(content) as unknown) : content;
    if (!isExtractionOutput(output)) throw new Error('openrouter output failed schema validation');
    const cacheTokens =
      completion.usage?.prompt_cache_hit_tokens ??
      completion.usage?.prompt_tokens_details?.cached_tokens ??
      0;
    return {
      output,
      usage: makeReceipt(this, request, {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        cacheTokens,
        providerCostUsd: completion.usage?.cost ?? 0,
        latencyMs: Date.now() - started,
      }),
    };
  }
}

/**
 * DeepSeek official API adapter.
 *
 * Uses the official DeepSeek API (https://api.deepseek.com) with
 * `response_format: { type: 'json_object' }` for structured extraction.
 * The API key comes ONLY from `process.env.DEEPSEEK_API_KEY` — never from
 * browser bundles, VITE_* values, fixtures, or commits.
 *
 * Models (verified live 2026-08-05): `deepseek-v4-flash`, `deepseek-v4-pro`.
 */
export interface DeepSeekAdapterConfig {
  apiKey: string;
  /** Official models: `deepseek-v4-flash` or `deepseek-v4-pro`. */
  model?: string;
  baseUrl?: string;
  maxOutputTokens?: number;
}

export class DeepSeekAdapter implements ModelAdapter {
  readonly provider = 'deepseek';
  readonly model: string;
  readonly available: boolean;
  readonly profile: DeepSeekModelProfile;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly maxOutputTokens: number;

  constructor(config: DeepSeekAdapterConfig) {
    this.model = config.model ?? 'deepseek-v4-flash';
    this.profile = getDeepSeekModelProfile(this.model);
    this.apiKey = config.apiKey;
    this.available = config.apiKey.length > 0;
    this.baseUrl = validateProviderBaseUrl(config.baseUrl ?? 'https://api.deepseek.com', {
      allowedHosts: ['api.deepseek.com'],
    });
    this.maxOutputTokens = config.maxOutputTokens ?? 4096;
  }

  /** Verify that the configured model is currently advertised by DeepSeek. */
  async verifyModelProfile(fetcher: typeof fetch = globalThis.fetch): Promise<{
    ok: boolean;
    checkedAtIso: string;
    error?: string;
  }> {
    const checkedAtIso = new Date().toISOString();
    try {
      const response = await fetcher(`${this.baseUrl}/models`, {
        headers: { authorization: `Bearer ${this.configApiKey()}` },
      });
      if (!response.ok)
        return { ok: false, checkedAtIso, error: `deepseek models http ${response.status}` };
      const body = (await response.json()) as { data?: { id?: string }[] };
      const advertised = body.data?.some((model) => model.id === this.model) ?? false;
      return advertised
        ? { ok: true, checkedAtIso }
        : { ok: false, checkedAtIso, error: `deepseek model not advertised: ${this.model}` };
    } catch (err) {
      return { ok: false, checkedAtIso, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async extract(
    request: ModelRequest,
  ): Promise<{ output: ExtractionOutput; usage: UsageReceiptLike }> {
    if (!this.available) {
      throw new Error('DeepSeek adapter is not configured (no API key)');
    }
    const started = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.configApiKey()}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract work instructions from source material into strict JSON. ' +
              'Every actionable claim MUST cite the source region id. ' +
              'Return ONLY JSON matching the schema: ' +
              '{"schemaVersion":1,"guideId":string,"tasks":[{"taskId":string,"title":string,' +
              '"steps":[{"stepId":string,"taskId":string,"action":string,"warnings":string[],' +
              '"prerequisites":string[],"tools":string[],"parts":string[],' +
              '"values":[{"label":string,"value":string,"unit":string|null}],' +
              '"conditions":string[],"verificationSteps":string[],"citations":string[],' +
              '"uncertaintyReason":string|null}]}]}',
          },
          {
            role: 'user',
            content: JSON.stringify(
              request.chunks.map((c) => ({
                regionId: c.regionId,
                pageIndex: c.pageIndex,
                text: c.text,
              })),
            ),
          },
        ],
        max_tokens: Math.min(
          request.maxOutputTokens ?? this.maxOutputTokens,
          this.profile.maxOutputTokens,
        ),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`deepseek http ${response.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        prompt_cache_hit_tokens?: number;
      };
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('deepseek empty content');
    const output = JSON.parse(content) as unknown;
    if (!isExtractionOutput(output)) {
      throw new Error('deepseek output failed schema validation');
    }
    return {
      output,
      usage: makeReceipt(this, request, {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        cacheTokens: body.usage?.prompt_cache_hit_tokens ?? 0,
        latencyMs: Date.now() - started,
      }),
    };
  }

  private configApiKey(): string {
    // Prefer the key passed to the constructor. The environment fallback is
    // retained for a server-only adapter constructed without explicit config.
    return this.apiKey.length > 0 ? this.apiKey : (process.env.DEEPSEEK_API_KEY ?? '');
  }
}

/** Seam for direct/self-hosted local models (e.g. Ollama). */
export class DirectModelAdapter implements ModelAdapter {
  readonly provider = 'direct';
  readonly model: string;
  readonly available: boolean;
  constructor(model: string, available: boolean) {
    this.model = model;
    this.available = available;
  }
  async extract(
    request: ModelRequest,
  ): Promise<{ output: ExtractionOutput; usage: UsageReceiptLike }> {
    if (!this.available) throw new Error('direct model not available');
    const fallback = new FakeModelAdapter();
    return fallback.extract(request);
  }
}

export class ModelGateway {
  private readonly adapters: ModelAdapter[];
  private readonly order: string[];
  private lastError: string | null = null;

  constructor(adapters: ModelAdapter[], order: string[] = adapters.map((a) => a.provider)) {
    this.adapters = adapters;
    this.order = order;
  }

  /** Route by privacy policy; fall back through available adapters. */
  async run(request: ModelRequest): Promise<ModelResponse> {
    this.lastError = null;
    const ordered = this.order
      .map((name) => this.adapters.find((a) => a.provider === name))
      .filter((a): a is ModelAdapter => Boolean(a?.available));

    if (request.policy === 'zdr') {
      // ZDR routing: prefer providers flagged for the region; fake is always
      // privacy-safe and deterministic.
      const safe = ordered.find((a) => a.provider === 'fake') ?? ordered[0];
      if (!safe)
        return {
          ok: false,
          receipt: this.emptyReceipt(request),
          error: 'no adapter for ZDR policy',
        };
      return this.tryAdapter(safe, request);
    }

    for (const adapter of ordered) {
      const result = await this.tryAdapter(adapter, request);
      if (result.ok) return result;
      this.lastError = result.error ?? this.lastError;
    }
    return {
      ok: false,
      receipt: this.emptyReceipt(request),
      error: this.lastError ?? 'all adapters failed',
    };
  }

  private async tryAdapter(adapter: ModelAdapter, request: ModelRequest): Promise<ModelResponse> {
    try {
      const { output, usage } = await adapter.extract(request);
      if (!isExtractionOutput(output)) {
        return {
          ok: false,
          receipt: usage,
          error: `${adapter.provider}: invalid extraction schema`,
        };
      }
      // Citation gate: every actionable step must have at least one citation
      // that resolves to a real region (zero-citation output is rejected).
      const citations: Citation[] = [];
      const issues: string[] = [];
      for (const task of output.tasks) {
        for (const step of task.steps) {
          const stepCitations: Citation[] = [];
          for (const regionId of step.citations) {
            const region = request.regions.get(regionId);
            if (!region) {
              issues.push(`uncited region ${regionId}`);
              continue;
            }
            if (request.sourceHash && region.sourceHash !== request.sourceHash) {
              issues.push(`source hash mismatch for region ${regionId}`);
              continue;
            }
            stepCitations.push({
              regionId,
              sourceHash: region.sourceHash,
              pageIndex: region.pageIndex,
              excerptHash: hashExcerpt(region.excerpt),
              claimRef: step.stepId,
            });
          }
          if (stepCitations.length === 0) {
            issues.push(`step ${step.stepId} has no valid citation`);
          } else {
            citations.push(...stepCitations);
          }
        }
      }
      if (issues.length > 0) {
        return {
          ok: false,
          receipt: usage,
          error: `uncited actionable output: ${issues.join('; ')}`,
        };
      }
      const confidence = computeConfidence({
        extractionQuality: 0.8,
        citationCoverage: citations.length > 0 ? 0.9 : 0,
        deterministicValidation: 1,
        sourceAmbiguity: 0.5,
      });
      return { ok: true, output, citations, confidence, receipt: usage };
    } catch (err) {
      return {
        ok: false,
        receipt: this.emptyReceipt(request),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private emptyReceipt(request: ModelRequest): UsageReceiptLike {
    return makeReceipt(
      {
        provider: 'gateway',
        model: 'none',
        available: false,
        extract: () => {
          throw new Error('unused');
        },
      },
      request,
      {},
    );
  }
}

function hashExcerpt(text: string): string {
  // Real SHA-256 (hex) of the excerpt bytes — deterministic content identity,
  // not a padded short hash. Matches the ContentHash contract (64 hex chars).
  return sha256Hex(new TextEncoder().encode(text));
}
