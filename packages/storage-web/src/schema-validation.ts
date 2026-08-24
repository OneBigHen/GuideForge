import Ajv2020 from 'ajv/dist/2020.js';
import evidenceSchema from '../schemas/EvidenceRecord.schema.json';
import reportSchema from '../schemas/RuntimeCompletionReport.schema.json';
import runtimeSchema from '../schemas/RuntimeSessionRecord.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
ajv.addFormat('date-time', {
  type: 'string',
  validate: (value: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value)),
});

ajv.addSchema(evidenceSchema);
const validateEvidence = ajv.compile(evidenceSchema);
const validateRuntime = ajv.compile(runtimeSchema);
const validateReport = ajv.compile(reportSchema);

export function validateEvidenceRecordSchema(value: unknown): boolean {
  return validateEvidence(value);
}

export function validateRuntimeSessionSchema(value: unknown): boolean {
  return validateRuntime(value);
}

export function validateRuntimeCompletionReportSchema(value: unknown): boolean {
  return validateReport(value);
}
