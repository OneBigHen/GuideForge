/** Offline procedure execution state. No browser, storage, or provider imports. */

export const EXECUTION_RUNTIME_VERSION = 1 as const;

export type RuntimeEvidenceKind = 'photo' | 'note' | 'signature' | 'measurement';

export interface RuntimeMeasurement {
  label: string;
  value: number;
  unit: string;
}

export interface RuntimeAttestation {
  algorithm: 'ECDSA-P256-SHA256';
  signerId: string;
  payloadHash: string;
  publicKeyJwk: Record<string, unknown>;
  signatureHex: string;
}

export interface RuntimeCompletionRule {
  minimumEvidenceCount: 1;
  allowedEvidenceKinds: RuntimeEvidenceKind[];
  verificationCount: number;
  requiresExplicitAction: true;
}

export interface StepAttempt {
  attemptId: string;
  stepId: string;
  startedAtIso: string;
  updatedAtIso: string;
  status: 'in-progress' | 'completed';
  evidenceIds: string[];
}

export interface StepCompletion {
  completionId: string;
  attemptId: string;
  stepId: string;
  completedAtIso: string;
  completedBy: string;
  evidenceIds: string[];
  rule: RuntimeCompletionRule;
}

export interface RuntimeSession {
  runtimeVersion: typeof EXECUTION_RUNTIME_VERSION;
  sessionId: string;
  guideId: string;
  learnerId: string;
  stepIds: string[];
  currentStepIndex: number;
  attempts: StepAttempt[];
  completions: StepCompletion[];
  status: 'in-progress' | 'completed';
  createdAtIso: string;
  updatedAtIso: string;
  completedAtIso: string | null;
}

export interface RuntimeProgress {
  completedSteps: number;
  totalSteps: number;
  currentStepId: string | null;
  fraction: number;
}

export interface RuntimeReportEvidence {
  evidenceId: string;
  stepId: string;
  kind: RuntimeEvidenceKind;
  capturedAtIso: string;
  value?: string;
  assetHash?: string;
  mimeType?: string;
  measurement?: RuntimeMeasurement;
  attestation?: RuntimeAttestation;
}

export interface RuntimeCompletionReport {
  reportVersion: 1;
  reportType: 'guideforge-procedure-completion';
  sessionId: string;
  guideId: string;
  learnerId: string;
  status: RuntimeSession['status'];
  startedAtIso: string;
  completedAtIso: string | null;
  exportedAtIso: string;
  totalSteps: number;
  completedSteps: number;
  steps: {
    stepId: string;
    title: string;
    completed: boolean;
    completion: StepCompletion | null;
  }[];
  evidence: RuntimeReportEvidence[];
}

const ALLOWED_EVIDENCE_KINDS: RuntimeEvidenceKind[] = ['photo', 'note', 'signature', 'measurement'];

export function createRuntimeCompletionRule(verificationCount = 0): RuntimeCompletionRule {
  return {
    minimumEvidenceCount: 1,
    allowedEvidenceKinds: [...ALLOWED_EVIDENCE_KINDS],
    verificationCount,
    requiresExplicitAction: true,
  };
}

export function createRuntimeSession(input: {
  sessionId: string;
  guideId: string;
  learnerId: string;
  stepIds: readonly string[];
  nowIso: string;
}): RuntimeSession {
  return {
    runtimeVersion: EXECUTION_RUNTIME_VERSION,
    sessionId: input.sessionId,
    guideId: input.guideId,
    learnerId: input.learnerId,
    stepIds: [...input.stepIds],
    currentStepIndex: 0,
    attempts: [],
    completions: [],
    status: 'in-progress',
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
    completedAtIso: null,
  };
}

export function beginRuntimeStep(
  session: RuntimeSession,
  stepId: string,
  attemptId: string,
  nowIso: string,
): RuntimeSession {
  if (session.status === 'completed') return session;
  if (session.stepIds[session.currentStepIndex] !== stepId) {
    throw new Error(`cannot begin non-current step: ${stepId}`);
  }
  if (session.completions.some((completion) => completion.stepId === stepId)) return session;
  if (
    session.attempts.some(
      (attempt) => attempt.stepId === stepId && attempt.status === 'in-progress',
    )
  ) {
    return session;
  }
  return {
    ...session,
    attempts: [
      ...session.attempts,
      {
        attemptId,
        stepId,
        startedAtIso: nowIso,
        updatedAtIso: nowIso,
        status: 'in-progress',
        evidenceIds: [],
      },
    ],
    updatedAtIso: nowIso,
  };
}

export function recordRuntimeEvidence(
  session: RuntimeSession,
  stepId: string,
  evidenceId: string,
  nowIso: string,
): RuntimeSession {
  const attempt = session.attempts.find(
    (candidate) => candidate.stepId === stepId && candidate.status === 'in-progress',
  );
  if (!attempt) throw new Error(`no active attempt for step: ${stepId}`);
  if (attempt.evidenceIds.includes(evidenceId)) return session;
  return {
    ...session,
    attempts: session.attempts.map((candidate) =>
      candidate.attemptId === attempt.attemptId
        ? {
            ...candidate,
            evidenceIds: [...candidate.evidenceIds, evidenceId],
            updatedAtIso: nowIso,
          }
        : candidate,
    ),
    updatedAtIso: nowIso,
  };
}

export function evaluateRuntimeCompletion(
  rule: RuntimeCompletionRule,
  evidence: readonly { kind: RuntimeEvidenceKind }[],
): { ok: boolean; reason: string | null } {
  if (evidence.length < rule.minimumEvidenceCount) {
    return { ok: false, reason: 'capture at least one evidence item before completing this step' };
  }
  if (evidence.some((item) => !rule.allowedEvidenceKinds.includes(item.kind))) {
    return { ok: false, reason: 'this step contains an unsupported evidence kind' };
  }
  return { ok: true, reason: null };
}

export function completeRuntimeStep(input: {
  session: RuntimeSession;
  stepId: string;
  completionId: string;
  completedBy: string;
  evidence: readonly { evidenceId: string; kind: RuntimeEvidenceKind }[];
  rule: RuntimeCompletionRule;
  nowIso: string;
}): RuntimeSession {
  const { session } = input;
  if (session.status === 'completed') return session;
  if (session.stepIds[session.currentStepIndex] !== input.stepId) {
    throw new Error(`cannot complete non-current step: ${input.stepId}`);
  }
  const attempt = session.attempts.find(
    (candidate) => candidate.stepId === input.stepId && candidate.status === 'in-progress',
  );
  if (!attempt) throw new Error(`no active attempt for step: ${input.stepId}`);
  const decision = evaluateRuntimeCompletion(input.rule, input.evidence);
  if (!decision.ok) throw new Error(decision.reason ?? 'step completion rejected');

  const nextIndex = Math.min(session.stepIds.length, session.currentStepIndex + 1);
  const completed = nextIndex >= session.stepIds.length;
  return {
    ...session,
    currentStepIndex: nextIndex,
    attempts: session.attempts.map((candidate) =>
      candidate.attemptId === attempt.attemptId
        ? { ...candidate, status: 'completed', updatedAtIso: input.nowIso }
        : candidate,
    ),
    completions: [
      ...session.completions,
      {
        completionId: input.completionId,
        attemptId: attempt.attemptId,
        stepId: input.stepId,
        completedAtIso: input.nowIso,
        completedBy: input.completedBy,
        evidenceIds: input.evidence.map((item) => item.evidenceId),
        rule: input.rule,
      },
    ],
    status: completed ? 'completed' : 'in-progress',
    updatedAtIso: input.nowIso,
    completedAtIso: completed ? input.nowIso : null,
  };
}

export function runtimeProgress(session: RuntimeSession): RuntimeProgress {
  const totalSteps = session.stepIds.length;
  const completedSteps = session.stepIds.filter((stepId) =>
    session.completions.some((completion) => completion.stepId === stepId),
  ).length;
  return {
    completedSteps,
    totalSteps,
    currentStepId: session.stepIds[session.currentStepIndex] ?? null,
    fraction: totalSteps === 0 ? 0 : completedSteps / totalSteps,
  };
}

export function buildRuntimeCompletionReport(input: {
  session: RuntimeSession;
  stepTitles: Readonly<Record<string, string>>;
  evidence: readonly RuntimeReportEvidence[];
  exportedAtIso: string;
}): RuntimeCompletionReport {
  const progress = runtimeProgress(input.session);
  return {
    reportVersion: 1,
    reportType: 'guideforge-procedure-completion',
    sessionId: input.session.sessionId,
    guideId: input.session.guideId,
    learnerId: input.session.learnerId,
    status: input.session.status,
    startedAtIso: input.session.createdAtIso,
    completedAtIso: input.session.completedAtIso,
    exportedAtIso: input.exportedAtIso,
    totalSteps: progress.totalSteps,
    completedSteps: progress.completedSteps,
    steps: input.session.stepIds.map((stepId) => {
      const completion =
        input.session.completions.find((candidate) => candidate.stepId === stepId) ?? null;
      return {
        stepId,
        title: input.stepTitles[stepId] ?? stepId,
        completed: completion !== null,
        completion,
      };
    }),
    evidence: [...input.evidence],
  };
}

export function isRuntimeSession(value: unknown): value is RuntimeSession {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.runtimeVersion === EXECUTION_RUNTIME_VERSION &&
    typeof record.sessionId === 'string' &&
    typeof record.guideId === 'string' &&
    typeof record.learnerId === 'string' &&
    Array.isArray(record.stepIds) &&
    record.stepIds.every((stepId) => typeof stepId === 'string') &&
    typeof record.currentStepIndex === 'number' &&
    Array.isArray(record.attempts) &&
    Array.isArray(record.completions) &&
    (record.status === 'in-progress' || record.status === 'completed') &&
    typeof record.createdAtIso === 'string' &&
    typeof record.updatedAtIso === 'string' &&
    (record.completedAtIso === null || typeof record.completedAtIso === 'string')
  );
}
