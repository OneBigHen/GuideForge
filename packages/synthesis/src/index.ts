/**
 * @guideforge/synthesis — source-grounded procedure synthesis (Phase 06).
 */
export { extractClaims, planProcedureStructure } from './extract.js';
export { synthesizeProcedure } from './synthesize.js';
export {
  normalizeToken,
  valueGrounded,
  type SourceCoverage,
  type SynthesisAmbiguity,
  type SynthesisIssue,
  type SynthesisPlan,
  type SynthesisRegion,
  type SynthesisRepair,
  type SynthesisRequest,
  type SynthesisSource,
} from './types.js';
export {
  computeSourceCoverage,
  detectAmbiguities,
  repairSynthesisPlan,
  validateSynthesisPlan,
} from './validate.js';
