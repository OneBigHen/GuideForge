import {
  validateEvidence,
  validateReport,
  validateRuntime,
} from './generated/schema-validators.js';

export function validateEvidenceRecordSchema(value: unknown): boolean {
  return validateEvidence(value);
}

export function validateRuntimeSessionSchema(value: unknown): boolean {
  return validateRuntime(value);
}

export function validateRuntimeCompletionReportSchema(value: unknown): boolean {
  return validateReport(value);
}
