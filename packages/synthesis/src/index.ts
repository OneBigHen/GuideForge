/**
 * @guideforge/synthesis — source-grounded procedure synthesis (Phase 06).
 */
export { extractClaims, planProcedureStructure } from './extract.js';
export {
  SynthesisGateway,
  type SynthesisBudget,
  type SynthesisGatewayMode,
  type SynthesisGatewayOptions,
  type SynthesisGatewayResult,
  type SynthesisGenerationReceipt,
} from './gateway.js';
export { synthesizeProcedure } from './synthesize.js';
export {
  normalizeToken,
  validateSynthesisRequest,
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
