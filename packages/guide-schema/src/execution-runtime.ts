/** Offline procedure execution state. No browser, storage, or provider imports. */

export const EXECUTION_RUNTIME_VERSION = 2 as const;
export const LEGACY_EXECUTION_RUNTIME_VERSION = 1 as const;

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
  minimumEvidenceCount: number;
  allowedEvidenceKinds: RuntimeEvidenceKind[];
  verificationCount: number;
  verificationIds: string[];
  requiresExplicitAction: true;
}

export interface RuntimeVerificationEvidence {
  verificationId: string;
  evidenceIds: string[];
}

export interface StepAttempt {
  attemptId: string;
  stepId: string;
  startedAtIso: string;
  updatedAtIso: string;
  status: 'in-progress' | 'completed';
  evidenceIds: string[];
  verificationEvidence: RuntimeVerificationEvidence[];
}

export interface StepCompletion {
  completionId: string;
  attemptId: string;
  stepId: string;
  completedAtIso: string;
  completedBy: string;
  evidenceIds: string[];
  verificationEvidence: RuntimeVerificationEvidence[];
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

export function createRuntimeCompletionRule(
  verificationIdsOrCount: readonly string[] | number = [],
): RuntimeCompletionRule {
  const verificationIds =
    typeof verificationIdsOrCount === 'number'
      ? Array.from(
          {
            length: Number.isInteger(verificationIdsOrCount)
              ? Math.max(0, verificationIdsOrCount)
              : 0,
          },
          (_, index) => `verification-${index + 1}`,
        )
      : normalizeIds(verificationIdsOrCount);
  const normalizedVerificationCount = verificationIds.length;
  return {
    minimumEvidenceCount: Math.max(1, normalizedVerificationCount),
    allowedEvidenceKinds: [...ALLOWED_EVIDENCE_KINDS],
    verificationCount: normalizedVerificationCount,
    verificationIds,
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
  verificationIds: readonly string[] = [],
): RuntimeSession {
  if (session.status === 'completed') return session;
  if (session.stepIds[session.currentStepIndex] !== stepId) {
    throw new Error(`cannot begin non-current step: ${stepId}`);
  }
  if (session.completions.some((completion) => completion.stepId === stepId)) return session;
  const existing = session.attempts.find(
    (attempt) => attempt.stepId === stepId && attempt.status === 'in-progress',
  );
  const normalizedVerificationIds = normalizeIds(verificationIds);
  if (existing) {
    if (normalizedVerificationIds.length === 0) return session;
    const mappedIds = new Set(existing.verificationEvidence.map((item) => item.verificationId));
    const nextVerificationEvidence = [
      ...existing.verificationEvidence,
      ...normalizedVerificationIds
        .filter((verificationId) => !mappedIds.has(verificationId))
        .map((verificationId) => ({ verificationId, evidenceIds: [] })),
    ];
    if (nextVerificationEvidence.length === existing.verificationEvidence.length) return session;
    return {
      ...session,
      attempts: session.attempts.map((attempt) =>
        attempt.attemptId === existing.attemptId
          ? { ...attempt, verificationEvidence: nextVerificationEvidence, updatedAtIso: nowIso }
          : attempt,
      ),
      updatedAtIso: nowIso,
    };
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
        verificationEvidence: normalizedVerificationIds.map((verificationId) => ({
          verificationId,
          evidenceIds: [],
        })),
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
  verificationId?: string,
): RuntimeSession {
  const attempt = session.attempts.find(
    (candidate) => candidate.stepId === stepId && candidate.status === 'in-progress',
  );
  if (!attempt) throw new Error(`no active attempt for step: ${stepId}`);
  if (attempt.evidenceIds.includes(evidenceId)) return session;
  const targetVerificationId =
    verificationId ??
    attempt.verificationEvidence.find((item) => item.evidenceIds.length === 0)?.verificationId ??
    attempt.verificationEvidence[0]?.verificationId;
  if (attempt.verificationEvidence.length > 0 && !targetVerificationId) {
    throw new Error('all verification checks already have evidence');
  }
  if (
    targetVerificationId &&
    !attempt.verificationEvidence.some((item) => item.verificationId === targetVerificationId)
  ) {
    throw new Error(`unknown verification check: ${targetVerificationId}`);
  }
  return {
    ...session,
    attempts: session.attempts.map((candidate) =>
      candidate.attemptId === attempt.attemptId
        ? {
            ...candidate,
            evidenceIds: [...candidate.evidenceIds, evidenceId],
            verificationEvidence: targetVerificationId
              ? candidate.verificationEvidence.map((item) =>
                  item.verificationId === targetVerificationId
                    ? { ...item, evidenceIds: [...item.evidenceIds, evidenceId] }
                    : item,
                )
              : candidate.verificationEvidence,
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
    return {
      ok: false,
      reason: `capture at least ${rule.minimumEvidenceCount} evidence item${rule.minimumEvidenceCount === 1 ? '' : 's'} before completing this step`,
    };
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
  const attemptEvidenceIds = new Set(attempt.evidenceIds);
  const completionEvidenceIds = input.evidence.map((item) => item.evidenceId);
  if (
    new Set(completionEvidenceIds).size !== completionEvidenceIds.length ||
    completionEvidenceIds.some((evidenceId) => !attemptEvidenceIds.has(evidenceId))
  ) {
    throw new Error('completion evidence must belong to the active step attempt');
  }
  const decision = evaluateRuntimeCompletion(input.rule, input.evidence);
  if (!decision.ok) throw new Error(decision.reason ?? 'step completion rejected');
  if (input.rule.verificationIds.length > 0) {
    const completionEvidence = new Set(completionEvidenceIds);
    const mappings = new Map(
      attempt.verificationEvidence.map((item) => [item.verificationId, item.evidenceIds]),
    );
    for (const verificationId of input.rule.verificationIds) {
      const mappedEvidenceIds = mappings.get(verificationId) ?? [];
      if (
        mappedEvidenceIds.length === 0 ||
        mappedEvidenceIds.some((evidenceId) => !completionEvidence.has(evidenceId))
      ) {
        throw new Error(`verification check is missing evidence: ${verificationId}`);
      }
    }
  }

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
        verificationEvidence: attempt.verificationEvidence.map((item) => ({
          verificationId: item.verificationId,
          evidenceIds: [...item.evidenceIds],
        })),
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
  if (
    record.runtimeVersion === EXECUTION_RUNTIME_VERSION &&
    typeof record.sessionId === 'string' &&
    record.sessionId.length > 0 &&
    typeof record.guideId === 'string' &&
    record.guideId.length > 0 &&
    typeof record.learnerId === 'string' &&
    record.learnerId.length > 0 &&
    typeof record.currentStepIndex === 'number' &&
    Array.isArray(record.stepIds) &&
    Array.isArray(record.attempts) &&
    Array.isArray(record.completions) &&
    (record.status === 'in-progress' || record.status === 'completed') &&
    isIsoDate(record.createdAtIso) &&
    isIsoDate(record.updatedAtIso) &&
    (record.completedAtIso === null || isIsoDate(record.completedAtIso))
  ) {
    const stepIds = record.stepIds;
    const currentStepIndex = record.currentStepIndex;
    const attempts = record.attempts;
    const completions = record.completions;
    if (
      !stepIds.every(
        (stepId): stepId is string => typeof stepId === 'string' && stepId.length > 0,
      ) ||
      new Set(stepIds).size !== stepIds.length ||
      !Number.isInteger(currentStepIndex) ||
      currentStepIndex < 0 ||
      currentStepIndex > stepIds.length
    ) {
      return false;
    }
    const stepIdSet = new Set(stepIds);
    const attemptIds = new Set<string>();
    for (const value of attempts) {
      if (!isStepAttempt(value, stepIdSet) || attemptIds.has(value.attemptId)) return false;
      attemptIds.add(value.attemptId);
    }
    const completionIds = new Set<string>();
    const completedStepIds = new Set<string>();
    for (const value of completions) {
      if (!isStepCompletion(value, stepIdSet, attempts, attemptIds)) return false;
      if (completionIds.has(value.completionId) || completedStepIds.has(value.stepId)) return false;
      completionIds.add(value.completionId);
      completedStepIds.add(value.stepId);
    }
    if (record.status === 'completed') {
      return (
        currentStepIndex === stepIds.length &&
        record.completedAtIso !== null &&
        completedStepIds.size === stepIds.length
      );
    }
    return record.completedAtIso === null;
  }
  return false;
}

/** Upgrade the v1 runtime without inventing authored verification evidence. */
export function migrateRuntimeSession(value: unknown): RuntimeSession | null {
  if (isRuntimeSession(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const legacy = value as Record<string, unknown>;
  if (
    legacy.runtimeVersion !== LEGACY_EXECUTION_RUNTIME_VERSION ||
    !Array.isArray(legacy.stepIds) ||
    !Array.isArray(legacy.attempts) ||
    !Array.isArray(legacy.completions)
  ) {
    return null;
  }
  const attempts = (legacy.attempts as unknown[]).map((attempt) => {
    if (!attempt || typeof attempt !== 'object') return null;
    return { ...(attempt as Record<string, unknown>), verificationEvidence: [] };
  });
  const completions = (legacy.completions as unknown[]).map((completion) => {
    if (!completion || typeof completion !== 'object') return null;
    const record = completion as Record<string, unknown>;
    return {
      ...record,
      verificationEvidence: [],
      rule: {
        ...(record.rule && typeof record.rule === 'object'
          ? (record.rule as Record<string, unknown>)
          : {}),
        minimumEvidenceCount: 1,
        verificationCount: 0,
        verificationIds: [],
        requiresExplicitAction: true,
      },
    };
  });
  const migrated = {
    ...legacy,
    runtimeVersion: EXECUTION_RUNTIME_VERSION,
    attempts,
    completions,
  };
  return isRuntimeSession(migrated) ? migrated : null;
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isStepAttempt(value: unknown, stepIds: ReadonlySet<string>): value is StepAttempt {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.attemptId === 'string' &&
    record.attemptId.length > 0 &&
    typeof record.stepId === 'string' &&
    stepIds.has(record.stepId) &&
    isIsoDate(record.startedAtIso) &&
    isIsoDate(record.updatedAtIso) &&
    (record.status === 'in-progress' || record.status === 'completed') &&
    Array.isArray(record.evidenceIds) &&
    new Set(record.evidenceIds).size === record.evidenceIds.length &&
    record.evidenceIds.every(
      (evidenceId) => typeof evidenceId === 'string' && evidenceId.length > 0,
    ) &&
    Array.isArray(record.verificationEvidence) &&
    isVerificationEvidence(record.verificationEvidence, new Set(record.evidenceIds))
  );
}

function isRuntimeCompletionRule(value: unknown): value is RuntimeCompletionRule {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const minimumEvidenceCount = record.minimumEvidenceCount;
  const verificationCount = record.verificationCount;
  return (
    typeof minimumEvidenceCount === 'number' &&
    Number.isInteger(minimumEvidenceCount) &&
    minimumEvidenceCount >= 1 &&
    Array.isArray(record.allowedEvidenceKinds) &&
    record.allowedEvidenceKinds.every((kind) =>
      ALLOWED_EVIDENCE_KINDS.includes(kind as RuntimeEvidenceKind),
    ) &&
    typeof verificationCount === 'number' &&
    Number.isInteger(verificationCount) &&
    verificationCount >= 0 &&
    Array.isArray(record.verificationIds) &&
    record.verificationIds.every(
      (verificationId) => typeof verificationId === 'string' && verificationId.length > 0,
    ) &&
    new Set(record.verificationIds).size === record.verificationIds.length &&
    record.verificationIds.length === verificationCount &&
    minimumEvidenceCount === Math.max(1, verificationCount) &&
    record.requiresExplicitAction === true
  );
}

function isVerificationEvidence(
  value: unknown,
  evidenceIds: ReadonlySet<string>,
): value is RuntimeVerificationEvidence[] {
  if (!Array.isArray(value)) return false;
  const verificationIds = new Set<string>();
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    if (
      typeof record.verificationId !== 'string' ||
      record.verificationId.length === 0 ||
      verificationIds.has(record.verificationId) ||
      !Array.isArray(record.evidenceIds) ||
      new Set(record.evidenceIds).size !== record.evidenceIds.length ||
      !record.evidenceIds.every(
        (evidenceId) => typeof evidenceId === 'string' && evidenceIds.has(evidenceId),
      )
    ) {
      return false;
    }
    verificationIds.add(record.verificationId);
    return true;
  });
}

function isStepCompletion(
  value: unknown,
  stepIds: ReadonlySet<string>,
  attempts: readonly unknown[],
  attemptIds: ReadonlySet<string>,
): value is StepCompletion {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const attempt = attempts.find(
    (candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      (candidate as Record<string, unknown>).attemptId === record.attemptId,
  ) as StepAttempt | undefined;
  const evidenceIds = Array.isArray(record.evidenceIds) ? record.evidenceIds : [];
  const rule = isRuntimeCompletionRule(record.rule) ? record.rule : null;
  const verificationEvidence = Array.isArray(record.verificationEvidence)
    ? record.verificationEvidence
    : null;
  return (
    typeof record.completionId === 'string' &&
    record.completionId.length > 0 &&
    typeof record.attemptId === 'string' &&
    attemptIds.has(record.attemptId) &&
    attempt?.status === 'completed' &&
    typeof record.stepId === 'string' &&
    stepIds.has(record.stepId) &&
    attempt.stepId === record.stepId &&
    isIsoDate(record.completedAtIso) &&
    typeof record.completedBy === 'string' &&
    record.completedBy.length > 0 &&
    new Set(evidenceIds).size === evidenceIds.length &&
    evidenceIds.length >= (rule?.minimumEvidenceCount ?? Number.MAX_SAFE_INTEGER) &&
    evidenceIds.every(
      (evidenceId) => typeof evidenceId === 'string' && attempt.evidenceIds.includes(evidenceId),
    ) &&
    rule !== null &&
    verificationEvidence !== null &&
    isVerificationEvidence(verificationEvidence, new Set(evidenceIds)) &&
    new Set(verificationEvidence.map((item) => item.verificationId)).size ===
      rule.verificationIds.length &&
    verificationEvidence.every((item) => rule.verificationIds.includes(item.verificationId)) &&
    (rule.verificationIds.length === 0 ||
      rule.verificationIds.every((verificationId) => {
        const mapping = verificationEvidence.find((item) => item.verificationId === verificationId);
        return mapping !== undefined && mapping.evidenceIds.length > 0;
      }))
  );
}

function normalizeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}
