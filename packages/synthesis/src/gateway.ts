import {
  computeConfidence,
  estimateTokens,
  isExtractionOutput,
  type SourceRegion,
} from '@guideforge/ai-contracts';
import { sha256Hex, type ContentHash } from '@guideforge/domain';
import {
  getDeepSeekModelProfile,
  type DeepSeekModelProfile,
  type ModelGateway,
} from '@guideforge/model-gateway';
import { synthesizeProcedure } from './synthesize.js';
import type { SynthesisPlan, SynthesisRegion, SynthesisRequest } from './types.js';
import {
  computeSourceCoverage,
  detectAmbiguities,
  repairSynthesisPlan,
  validateSynthesisPlan,
} from './validate.js';

export type SynthesisGatewayMode = 'deepseek' | 'offline-rules';

export interface SynthesisBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
}

export interface SynthesisGatewayOptions {
  mode: SynthesisGatewayMode;
  modelGateway?: ModelGateway;
  profile?: DeepSeekModelProfile;
  promptVersion?: string;
  budget?: Partial<SynthesisBudget>;
  /** Injectable for tests; the default is a bounded per-process cache. */
  cache?: Map<string, SynthesisPlan>;
}

export interface SynthesisGenerationReceipt {
  provider: string;
  model: string;
  profileVerifiedAtIso: string | null;
  providerApiVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
  sourceHashes: ContentHash[];
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  cacheHit: boolean;
  providerCostUsd: number;
  budgetUsd: number;
  latencyMs: number;
  requestId: string;
  createdAtIso: string;
  status: 'complete' | 'failed';
  error?: string;
}

export interface SynthesisGatewayResult {
  ok: boolean;
  mode: SynthesisGatewayMode;
  plan?: SynthesisPlan;
  receipt: SynthesisGenerationReceipt;
  error?: string;
}

const DEFAULT_BUDGET: SynthesisBudget = {
  maxInputTokens: 12_000,
  maxOutputTokens: 4_096,
  maxCostUsd: 0.25,
};
const DEFAULT_CACHE = new Map<string, SynthesisPlan>();
const MAX_CACHE_ENTRIES = 32;

/**
 * Provider orchestration for source-grounded synthesis.
 *
 * The offline path is deliberately a separate mode. A missing DeepSeek key or
 * failed request never changes a receipt from `deepseek` to local rules.
 */
export class SynthesisGateway {
  private readonly options: SynthesisGatewayOptions;
  private readonly budget: SynthesisBudget;
  private readonly cache: Map<string, SynthesisPlan>;

  constructor(options: SynthesisGatewayOptions) {
    this.options = options;
    this.budget = { ...DEFAULT_BUDGET, ...options.budget };
    this.cache = options.cache ?? DEFAULT_CACHE;
  }

  async run(request: SynthesisRequest): Promise<SynthesisGatewayResult> {
    const started = Date.now();
    const sourceHashes = [...new Set(request.sources.map((source) => source.sourceHash))].sort();
    const promptVersion = this.options.promptVersion ?? 'phase05-synthesis-v1';

    if (this.options.mode === 'offline-rules') {
      const plan = synthesizeProcedure(request);
      return {
        ok: plan.issues.every((issue) => issue.severity !== 'error'),
        mode: 'offline-rules',
        plan,
        receipt: this.receipt({
          provider: 'synthesis-local',
          model: 'synthesis-rules-v1',
          sourceHashes,
          promptVersion,
          inputTokens: estimateRequestTokens(request),
          outputTokens: 0,
          cacheTokens: 0,
          cacheHit: false,
          providerCostUsd: 0,
          budgetUsd: this.budget.maxCostUsd,
          latencyMs: Date.now() - started,
          requestId: crypto.randomUUID(),
          status: 'complete',
        }),
      };
    }

    const profile = this.options.profile ?? getDeepSeekModelProfile();
    const inputTokens = estimateRequestTokens(request);
    if (inputTokens > this.budget.maxInputTokens) {
      return this.failed({
        mode: 'deepseek',
        profile,
        sourceHashes,
        promptVersion,
        inputTokens,
        latencyMs: Date.now() - started,
        error: `synthesis input budget exceeded: ${inputTokens} > ${this.budget.maxInputTokens} tokens`,
      });
    }

    const worstCaseCost = costFor(profile, inputTokens, this.budget.maxOutputTokens, 0);
    if (worstCaseCost > this.budget.maxCostUsd) {
      return this.failed({
        mode: 'deepseek',
        profile,
        sourceHashes,
        promptVersion,
        inputTokens,
        latencyMs: Date.now() - started,
        error: `synthesis cost budget exceeded before request: $${worstCaseCost.toFixed(6)} > $${this.budget.maxCostUsd.toFixed(6)}`,
      });
    }

    const cacheKey = requestCacheKey(request, profile.id, promptVersion, this.budget);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        ok: true,
        mode: 'deepseek',
        plan: cached,
        receipt: this.receipt({
          provider: 'deepseek',
          model: profile.id,
          profileVerifiedAtIso: profile.verifiedAtIso,
          providerApiVersion: profile.providerApiVersion,
          sourceHashes,
          promptVersion,
          inputTokens,
          outputTokens: 0,
          cacheTokens: inputTokens,
          cacheHit: true,
          providerCostUsd: costFor(profile, inputTokens, 0, inputTokens),
          budgetUsd: this.budget.maxCostUsd,
          latencyMs: Date.now() - started,
          requestId: crypto.randomUUID(),
          status: 'complete',
        }),
      };
    }

    if (!this.options.modelGateway) {
      return this.failed({
        mode: 'deepseek',
        profile,
        sourceHashes,
        promptVersion,
        inputTokens,
        latencyMs: Date.now() - started,
        error: 'DeepSeek synthesis gateway is not configured',
      });
    }

    const regions = toModelRegions(request);
    let response: Awaited<ReturnType<ModelGateway['run']>>;
    try {
      response = await this.options.modelGateway.run({
        sourceHash: sourceHashes.length === 1 ? sourceHashes[0]! : null,
        chunks: request.sources.flatMap((source) =>
          source.regions.map((region) => ({
            regionId: region.regionId,
            text: region.excerpt,
            pageIndex: region.pageIndex,
          })),
        ),
        regions,
        promptVersion,
        policy: 'default',
        model: profile.id,
        maxOutputTokens: this.budget.maxOutputTokens,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return this.failed({
        mode: 'deepseek',
        profile,
        sourceHashes,
        promptVersion,
        inputTokens,
        latencyMs: Date.now() - started,
        error,
      });
    }

    const usage = response.receipt;
    const providerCostUsd = costFor(
      profile,
      usage.inputTokens || inputTokens,
      usage.outputTokens,
      usage.cacheTokens,
    );
    const baseReceipt = {
      provider: 'deepseek',
      model: profile.id,
      profileVerifiedAtIso: profile.verifiedAtIso,
      providerApiVersion: profile.providerApiVersion,
      sourceHashes,
      promptVersion,
      inputTokens: usage.inputTokens || inputTokens,
      outputTokens: usage.outputTokens,
      cacheTokens: usage.cacheTokens,
      cacheHit: usage.cacheTokens > 0,
      providerCostUsd,
      budgetUsd: this.budget.maxCostUsd,
      latencyMs: usage.latencyMs || Date.now() - started,
      requestId: usage.requestId,
    };

    if (providerCostUsd > this.budget.maxCostUsd) {
      return {
        ok: false,
        mode: 'deepseek',
        receipt: this.receipt({
          ...baseReceipt,
          status: 'failed',
          error: `synthesis cost budget exceeded: $${providerCostUsd.toFixed(6)} > $${this.budget.maxCostUsd.toFixed(6)}`,
        }),
        error: `synthesis cost budget exceeded: $${providerCostUsd.toFixed(6)} > $${this.budget.maxCostUsd.toFixed(6)}`,
      };
    }
    if (!response.ok || !response.output) {
      const error = response.error ?? 'DeepSeek synthesis failed';
      return {
        ok: false,
        mode: 'deepseek',
        receipt: this.receipt({ ...baseReceipt, status: 'failed', error }),
        error,
      };
    }

    const plan = buildModelPlan(request, response.output);
    if (plan.issues.some((issue) => issue.severity === 'error')) {
      const error = plan.issues.map((issue) => issue.message).join('; ');
      return {
        ok: false,
        mode: 'deepseek',
        plan,
        receipt: this.receipt({ ...baseReceipt, status: 'failed', error }),
        error,
      };
    }

    this.cache.set(cacheKey, plan);
    trimCache(this.cache);
    return {
      ok: true,
      mode: 'deepseek',
      plan,
      receipt: this.receipt({ ...baseReceipt, status: 'complete' }),
    };
  }

  private receipt(input: Partial<SynthesisGenerationReceipt>): SynthesisGenerationReceipt {
    return {
      provider: input.provider ?? 'gateway',
      model: input.model ?? 'none',
      profileVerifiedAtIso: input.profileVerifiedAtIso ?? null,
      providerApiVersion: input.providerApiVersion ?? null,
      promptVersion: input.promptVersion ?? 'phase05-synthesis-v1',
      schemaVersion: 'synthesis-output-v1',
      sourceHashes: input.sourceHashes ?? [],
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      cacheTokens: input.cacheTokens ?? 0,
      cacheHit: input.cacheHit ?? false,
      providerCostUsd: input.providerCostUsd ?? 0,
      budgetUsd: input.budgetUsd ?? this.budget.maxCostUsd,
      latencyMs: input.latencyMs ?? 0,
      requestId: input.requestId ?? crypto.randomUUID(),
      createdAtIso: new Date().toISOString(),
      status: input.status ?? 'failed',
      ...(input.error ? { error: input.error } : {}),
    };
  }

  private failed(input: {
    mode: 'deepseek';
    profile: DeepSeekModelProfile;
    sourceHashes: ContentHash[];
    promptVersion: string;
    inputTokens: number;
    latencyMs: number;
    error: string;
  }): SynthesisGatewayResult {
    return {
      ok: false,
      mode: input.mode,
      receipt: this.receipt({
        provider: 'deepseek',
        model: input.profile.id,
        profileVerifiedAtIso: input.profile.verifiedAtIso,
        providerApiVersion: input.profile.providerApiVersion,
        sourceHashes: input.sourceHashes,
        promptVersion: input.promptVersion,
        inputTokens: input.inputTokens,
        budgetUsd: this.budget.maxCostUsd,
        latencyMs: input.latencyMs,
        status: 'failed',
        error: input.error,
      }),
      error: input.error,
    };
  }
}

function toModelRegions(request: SynthesisRequest): Map<string, SourceRegion> {
  const regions = new Map<string, SourceRegion>();
  for (const source of request.sources) {
    for (const region of source.regions) {
      regions.set(region.regionId, {
        regionId: region.regionId,
        sourceHash: region.sourceHash,
        pageIndex: region.pageIndex,
        structuralPath: region.structuralPath,
        excerpt: region.excerpt,
        kind: region.kind,
      });
    }
  }
  return regions;
}

function buildModelPlan(
  request: SynthesisRequest,
  modelOutput: SynthesisPlan['output'],
): SynthesisPlan {
  const regionMap = new Map<string, SynthesisRegion>();
  for (const source of request.sources) {
    for (const region of source.regions) regionMap.set(region.regionId, region);
  }
  const sourceHashes = new Set(request.sources.map((source) => source.sourceHash));
  const normalized = { ...modelOutput, guideId: request.guideId };
  const initial = validateSynthesisPlan(normalized, regionMap, sourceHashes);
  const repaired = repairSynthesisPlan(normalized, regionMap);
  const revalidated = validateSynthesisPlan(repaired.output, regionMap, sourceHashes);
  const schemaOk = isExtractionOutput(repaired.output);
  const issues = schemaOk && revalidated.ok ? [] : [...initial.issues, ...revalidated.issues];
  if (!schemaOk)
    issues.push({
      severity: 'error',
      code: 'schema',
      message: 'repaired synthesis output failed runtime schema validation',
    });
  const coverage = computeSourceCoverage([...regionMap.values()], repaired.output);
  const ambiguities = detectAmbiguities(request.sources);
  return {
    output: repaired.output,
    coverage,
    ambiguities,
    issues,
    confidence: computeConfidence({
      extractionQuality: schemaOk ? 0.8 : 0,
      citationCoverage: coverage.coverageRatio,
      deterministicValidation: revalidated.ok && schemaOk ? 1 : 0,
      sourceAmbiguity: ambiguities.length > 0 ? 0.3 : 0.8,
    }),
    repair: repaired.repair,
  };
}

function estimateRequestTokens(request: SynthesisRequest): number {
  return request.sources.reduce(
    (total, source) =>
      total +
      source.regions.reduce(
        (sourceTotal, region) => sourceTotal + estimateTokens(region.excerpt),
        0,
      ),
    0,
  );
}

function requestCacheKey(
  request: SynthesisRequest,
  model: string,
  promptVersion: string,
  budget: SynthesisBudget,
): string {
  const normalized = request.sources
    .map((source) => ({
      sourceHash: source.sourceHash,
      regions: source.regions.map((region) => ({
        regionId: region.regionId,
        pageIndex: region.pageIndex,
        structuralPath: region.structuralPath,
        excerpt: region.excerpt,
        kind: region.kind,
      })),
    }))
    .sort((a, b) => a.sourceHash.localeCompare(b.sourceHash));
  return sha256Hex(
    new TextEncoder().encode(
      JSON.stringify({
        guideId: request.guideId,
        sources: normalized,
        model,
        promptVersion,
        budget,
      }),
    ),
  );
}

function costFor(
  profile: DeepSeekModelProfile,
  inputTokens: number,
  outputTokens: number,
  cacheTokens: number,
): number {
  const cached = Math.min(inputTokens, cacheTokens);
  const uncached = inputTokens - cached;
  return (
    (uncached * profile.inputCostUsdPerMillion + cached * profile.cacheReadCostUsdPerMillion) /
      1_000_000 +
    (outputTokens * profile.outputCostUsdPerMillion) / 1_000_000
  );
}

function trimCache(cache: Map<string, SynthesisPlan>): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== 'string') return;
    cache.delete(oldest);
  }
}
