/**
 * @guideforge/synthesis — source-grounded procedure synthesis (Phase 06).
 *
 * Deterministic procedure synthesis from ingested source regions. The AI
 * proposes; it never mutates the guide directly. This package turns source
 * regions into a strict `ExtractionOutput` where every actionable step cites
 * at least one real source region.
 *
 * Trust model:
 *  - source regions are untrusted; every claim must cite them (citation gate);
 *  - invented values (values not present in any cited region) are rejected;
 *  - ambiguity and near-duplicate conflicts are surfaced, never hidden;
 *  - one bounded repair fixes only deterministic, safe issues and reports
 *    exactly what it changed.
 */
import type { ExtractionOutput } from '@guideforge/ai-contracts';
import { isContentHash, type ContentHash } from '@guideforge/domain';

/** Normalized source region (from Phase 05 SourceRecord.regions). */
export interface SynthesisRegion {
  regionId: string;
  sourceHash: ContentHash;
  pageIndex: number;
  structuralPath: string;
  excerpt: string;
  kind: 'paragraph' | 'heading' | 'list-item' | 'table-row' | 'figure-caption' | 'warning';
}

export interface SynthesisSource {
  sourceHash: ContentHash;
  originalFilename: string;
  detectedType: string;
  sizeBytes: number;
  regions: SynthesisRegion[];
}

export interface SynthesisRequest {
  guideId: string;
  /** Optional user intent text (never trusted as instructions; hints only). */
  prompt?: string;
  sources: SynthesisSource[];
}

export function validateSynthesisRequest(value: unknown): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (typeof value !== 'object' || value === null)
    return { ok: false, issues: ['request must be an object'] };
  const request = value as Record<string, unknown>;
  if (typeof request.guideId !== 'string' || request.guideId.length === 0) {
    issues.push('guideId is required');
  }
  if (!Array.isArray(request.sources) || request.sources.length === 0) {
    issues.push('at least one source is required');
    return { ok: false, issues };
  }
  const regionIds = new Set<string>();
  for (const [sourceIndex, sourceValue] of request.sources.entries()) {
    if (typeof sourceValue !== 'object' || sourceValue === null) {
      issues.push(`source ${sourceIndex} must be an object`);
      continue;
    }
    const source = sourceValue as Record<string, unknown>;
    if (typeof source.sourceHash !== 'string' || !isContentHash(source.sourceHash)) {
      issues.push(`source ${sourceIndex} has an invalid SHA-256 sourceHash`);
    }
    if (typeof source.originalFilename !== 'string' || source.originalFilename.length === 0) {
      issues.push(`source ${sourceIndex} has no originalFilename`);
    }
    if (typeof source.detectedType !== 'string' || source.detectedType.length === 0) {
      issues.push(`source ${sourceIndex} has no detectedType`);
    }
    if (typeof source.sizeBytes !== 'number' || source.sizeBytes < 0) {
      issues.push(`source ${sourceIndex} has an invalid sizeBytes`);
    }
    if (!Array.isArray(source.regions) || source.regions.length === 0) {
      issues.push(`source ${sourceIndex} has no regions`);
      continue;
    }
    for (const [regionIndex, regionValue] of source.regions.entries()) {
      if (typeof regionValue !== 'object' || regionValue === null) {
        issues.push(`source ${sourceIndex} region ${regionIndex} must be an object`);
        continue;
      }
      const region = regionValue as Record<string, unknown>;
      if (typeof region.regionId !== 'string' || region.regionId.length === 0) {
        issues.push(`source ${sourceIndex} region ${regionIndex} has no regionId`);
      } else if (regionIds.has(region.regionId)) {
        issues.push(`duplicate regionId: ${region.regionId}`);
      } else {
        regionIds.add(region.regionId);
      }
      if (region.sourceHash !== source.sourceHash) {
        issues.push(`source ${sourceIndex} region ${regionIndex} sourceHash mismatch`);
      }
      if (typeof region.excerpt !== 'string' || region.excerpt.length === 0) {
        issues.push(`source ${sourceIndex} region ${regionIndex} has no excerpt`);
      }
      if (
        region.kind !== 'paragraph' &&
        region.kind !== 'heading' &&
        region.kind !== 'list-item' &&
        region.kind !== 'table-row' &&
        region.kind !== 'figure-caption' &&
        region.kind !== 'warning'
      ) {
        issues.push(`source ${sourceIndex} region ${regionIndex} has an invalid kind`);
      }
      if (
        typeof region.pageIndex !== 'number' ||
        !Number.isInteger(region.pageIndex) ||
        region.pageIndex < 0
      ) {
        issues.push(`source ${sourceIndex} region ${regionIndex} has an invalid pageIndex`);
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

export interface SourceCoverage {
  totalRegions: number;
  citedRegions: number;
  /** Fraction of regions actually cited by the plan. */
  coverageRatio: number;
  uncitedRegions: string[];
}

export interface SynthesisAmbiguity {
  regionId: string;
  sourceHash: ContentHash;
  reason: 'near-duplicate' | 'no-text' | 'contradictory-excerpt';
  otherRegionId?: string;
  detail: string;
}

export interface SynthesisIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  stepId?: string;
  regionId?: string;
}

export interface SynthesisRepair {
  repairs: string[];
  /** True when the repair dropped or altered an actionable claim. */
  droppedActionable: boolean;
}

export interface SynthesisPlan {
  output: ExtractionOutput;
  coverage: SourceCoverage;
  ambiguities: SynthesisAmbiguity[];
  issues: SynthesisIssue[];
  confidence: {
    extractionQuality: number;
    citationCoverage: number;
    deterministicValidation: number;
    sourceAmbiguity: number;
    overall: number;
  };
  /** Exactly what the bounded repair changed (empty when nothing was needed). */
  repair: SynthesisRepair;
}

/** True when `value` appears verbatim (normalized) inside the region excerpt. */
export function valueGrounded(value: string, region: SynthesisRegion): boolean {
  const nv = normalizeToken(value);
  if (nv.length < 2) return false;
  return normalizeToken(region.excerpt).includes(nv);
}

/** Ground a structured numeric/unit value against one cited region. */
export function structuredValueGrounded(
  value: { label: string; value: string; unit?: string },
  region: SynthesisRegion,
): boolean {
  if (valueGrounded(value.label, region)) return true;
  const candidate = `${value.value}${value.unit ?? ''}`;
  return valueGrounded(candidate, region);
}

export function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}
