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
import type { ContentHash } from '@guideforge/domain';

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

export function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}
