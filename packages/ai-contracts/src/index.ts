/**
 * @guideforge/ai-contracts — AI proposal pipeline contracts.
 *
 * Strict JSON Schemas for document intake, source regions, extraction,
 * claims/citations, proposals, and usage receipts. Framework-independent.
 * The trust model: source documents are untrusted; AI proposes, never
 * silently edits or publishes.
 */
import type { ContentHash, EntityId } from '@guideforge/domain';

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export interface SourceDocument {
  sourceId: EntityId;
  originalFilename: string;
  detectedType: string;
  sha256: ContentHash;
  sizeBytes: number;
  pageCount: number;
  encrypted: boolean;
  malwareStatus: 'clean' | 'blocked' | 'unknown';
  intakeActor: string;
  retentionClass: string;
  receivedAtIso: string;
}

export interface IntakePolicy {
  maxSizeBytes: number;
  maxPages: number;
  allowedTypes: string[];
}

export interface IntakeVerdict {
  accepted: boolean;
  reason?: string;
}

export function evaluateIntake(
  policy: IntakePolicy,
  candidate: {
    detectedType: string;
    sizeBytes: number;
    pageCount: number;
    encrypted: boolean;
    malwareStatus: SourceDocument['malwareStatus'];
  },
): IntakeVerdict {
  if (candidate.encrypted) return { accepted: false, reason: 'encrypted' };
  if (candidate.malwareStatus === 'blocked') return { accepted: false, reason: 'malware' };
  if (!policy.allowedTypes.includes(candidate.detectedType)) {
    return { accepted: false, reason: `unsupported type: ${candidate.detectedType}` };
  }
  if (candidate.sizeBytes > policy.maxSizeBytes) {
    return { accepted: false, reason: 'too large' };
  }
  if (candidate.pageCount > policy.maxPages) {
    return { accepted: false, reason: 'too many pages' };
  }
  return { accepted: true };
}

// ---------------------------------------------------------------------------
// Source regions (stable IDs from hash + structural position)
// ---------------------------------------------------------------------------

export interface SourceRegion {
  regionId: string;
  sourceHash: ContentHash;
  pageIndex: number;
  /** Structural path, e.g. "heading:1/section:2/paragraph:3". */
  structuralPath: string;
  /** Excerpt text (deterministic; used for citation excerpt-hash checks). */
  excerpt: string;
  kind: 'paragraph' | 'heading' | 'list-item' | 'table-row' | 'figure-caption' | 'warning';
}

export function stableRegionId(
  sourceHash: ContentHash,
  pageIndex: number,
  structuralPath: string,
): string {
  // Deterministic: same inputs => same id across runs.
  let h = 0x811c9dc5;
  const data = `${sourceHash}:${pageIndex}:${structuralPath}`;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `reg-${(h >>> 0).toString(36)}-${pageIndex}-${structuralPath.length}`;
}

// ---------------------------------------------------------------------------
// Structural chunking
// ---------------------------------------------------------------------------

export interface ChunkedRegion {
  region: SourceRegion;
  tokenEstimate: number;
}

/** Simple token estimator (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Chunk by structure (headings, paragraphs, list items, warnings), NOT by
 * arbitrary token windows. Returns stable regions.
 */
export function structuralChunking(
  sourceHash: ContentHash,
  pageIndex: number,
  blocks: { kind: SourceRegion['kind']; text: string; structuralPath: string }[],
): ChunkedRegion[] {
  return blocks.map((block) => {
    const region: SourceRegion = {
      regionId: stableRegionId(sourceHash, pageIndex, block.structuralPath),
      sourceHash,
      pageIndex,
      structuralPath: block.structuralPath,
      excerpt: block.text,
      kind: block.kind,
    };
    return { region, tokenEstimate: estimateTokens(block.text) };
  });
}

// ---------------------------------------------------------------------------
// Extraction / claims / citations
// ---------------------------------------------------------------------------

export interface ExtractionStep {
  stepId: string;
  taskId: string;
  action: string;
  warnings: string[];
  prerequisites: string[];
  tools: string[];
  parts: string[];
  values: { label: string; value: string; unit?: string }[];
  conditions: string[];
  verificationSteps: string[];
  citations: string[];
  uncertaintyReason?: string;
}

export interface ExtractionTask {
  taskId: string;
  title: string;
  steps: ExtractionStep[];
}

/** Strict extraction output contract (model output validated against this). */
export interface ExtractionOutput {
  schemaVersion: 1;
  guideId: string;
  tasks: ExtractionTask[];
}

export function isExtractionOutput(value: unknown): value is ExtractionOutput {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || typeof v.guideId !== 'string' || !Array.isArray(v.tasks)) {
    return false;
  }
  // Deep validation: every task must carry a taskId, title, and non-empty
  // steps; every step must have all required string/string[] fields and valid
  // citation entries. The model's JSON mode guarantees JSON syntax only, so
  // domain conformance must be proven here (AGENTS_SINGLE_USER.md).
  return v.tasks.every((t) => {
    if (typeof t !== 'object' || t === null) return false;
    const task = t as Record<string, unknown>;
    if (typeof task.taskId !== 'string' || task.taskId.length === 0) return false;
    if (typeof task.title !== 'string') return false;
    if (!Array.isArray(task.steps) || task.steps.length === 0) return false;
    return task.steps.every((s) => {
      if (typeof s !== 'object' || s === null) return false;
      const step = s as Record<string, unknown>;
      return (
        typeof step.stepId === 'string' &&
        step.stepId.length > 0 &&
        typeof step.taskId === 'string' &&
        typeof step.action === 'string' &&
        step.action.length > 0 &&
        Array.isArray(step.warnings) &&
        step.warnings.every((w) => typeof w === 'string') &&
        Array.isArray(step.prerequisites) &&
        step.prerequisites.every((p) => typeof p === 'string') &&
        Array.isArray(step.tools) &&
        step.tools.every((tl) => typeof tl === 'string') &&
        Array.isArray(step.parts) &&
        step.parts.every((p) => typeof p === 'string') &&
        Array.isArray(step.values) &&
        step.values.every(
          (val) =>
            typeof val === 'object' &&
            val !== null &&
            typeof (val as Record<string, unknown>).label === 'string' &&
            typeof (val as Record<string, unknown>).value === 'string',
        ) &&
        Array.isArray(step.conditions) &&
        step.conditions.every((c) => typeof c === 'string') &&
        Array.isArray(step.verificationSteps) &&
        step.verificationSteps.every((v2) => typeof v2 === 'string') &&
        Array.isArray(step.citations) &&
        step.citations.every((c) => typeof c === 'string')
      );
    });
  });
}

export interface Citation {
  regionId: string;
  pageIndex: number;
  excerptHash: string;
  /** SHA-256 of the region excerpt (deterministic check). */
  claimRef: string;
}

export interface ExtractedClaim {
  claimId: string;
  stepId: string;
  text: string;
  citations: Citation[];
}

// ---------------------------------------------------------------------------
// Citation gate
// ---------------------------------------------------------------------------

export interface CitationValidationResult {
  valid: boolean;
  issues: string[];
}

/** A claim is actionable only if it cites ≥1 valid, existing source region. */
export function validateCitations(
  claim: { citations: Citation[] },
  knownRegions: Map<string, SourceRegion>,
  hashExcerpt: (text: string) => string,
): CitationValidationResult {
  const issues: string[] = [];
  if (claim.citations.length === 0) {
    issues.push('claim has no citations');
    return { valid: false, issues };
  }
  for (const citation of claim.citations) {
    const region = knownRegions.get(citation.regionId);
    if (!region) {
      issues.push(`region not found: ${citation.regionId}`);
      continue;
    }
    if (region.pageIndex !== citation.pageIndex) {
      issues.push(`page mismatch for ${citation.regionId}`);
    }
    if (hashExcerpt(region.excerpt) !== citation.excerptHash) {
      issues.push(`excerpt hash mismatch for ${citation.regionId}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export interface ConfidenceBreakdown {
  extractionQuality: number;
  citationCoverage: number;
  deterministicValidation: number;
  sourceAmbiguity: number;
  /** 0..1 combined; NOT model self-confidence. */
  overall: number;
}

export function computeConfidence(args: {
  extractionQuality: number;
  citationCoverage: number;
  deterministicValidation: number;
  sourceAmbiguity: number;
}): ConfidenceBreakdown {
  const overall =
    args.extractionQuality * 0.4 +
    args.citationCoverage * 0.3 +
    args.deterministicValidation * 0.2 +
    args.sourceAmbiguity * 0.1;
  return { ...args, overall: clamp01(overall) };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export interface AiProposal {
  proposalId: EntityId;
  guideId: string;
  commandType: string;
  payload: Record<string, unknown>;
  summary: string;
  confidence: ConfidenceBreakdown;
  citations: Citation[];
  sourceHash: ContentHash | null;
  createdAtIso: string;
}

// ---------------------------------------------------------------------------
// Usage receipts
// ---------------------------------------------------------------------------

export interface UsageReceipt {
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
