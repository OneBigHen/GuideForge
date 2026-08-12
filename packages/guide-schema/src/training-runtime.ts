import type { EntityId } from '@guideforge/domain';
import type { AssessmentItem, TrainingState } from './index.js';

export type TrainingResponse = string | string[] | number | null;

export type TrainingMasteryStatus = 'in-progress' | 'remediation' | 'failed' | 'mastered';

export interface TrainingItemResult {
  itemId: EntityId;
  objectiveId: EntityId;
  response: TrainingResponse;
  correct: boolean;
  score: number;
  remediationActivityIds: EntityId[];
}

export interface TrainingObjectiveOutcome {
  objectiveId: EntityId;
  itemIds: EntityId[];
  score: number;
  passed: boolean;
}

export interface TrainingAttempt {
  attemptId: string;
  attemptNumber: number;
  startedAtIso: string;
  submittedAtIso: string;
  itemResults: TrainingItemResult[];
  objectiveOutcomes: TrainingObjectiveOutcome[];
  score: number;
  passed: boolean;
  criticalItemsPassed: number;
  remediationActivityIds: EntityId[];
  status: Exclude<TrainingMasteryStatus, 'in-progress'>;
}

/** JSON-safe local record. Dexie persists this shape without browser objects. */
export interface TrainingSession {
  sessionId: string;
  guideId: string;
  learnerId: string;
  blueprintId: EntityId | null;
  itemIds: EntityId[];
  responses: Record<string, TrainingResponse>;
  currentItemIndex: number;
  attempts: TrainingAttempt[];
  status: TrainingMasteryStatus;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface TrainingAttemptResult {
  session: TrainingSession;
  attempt: TrainingAttempt;
}

export interface TrainingEvent {
  eventId: string;
  type: 'initialized' | 'answered' | 'attempt-submitted' | 'mastered';
  sessionId: string;
  attemptId?: string;
  itemId?: EntityId;
  activityIds: EntityId[];
  occurredAtIso: string;
  data: Record<string, boolean | number | string>;
}

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

function itemIdsFor(training: TrainingState): EntityId[] {
  const requested = training.assessmentBlueprint?.itemIds ?? [];
  const available = new Set(training.assessmentItems.map((item) => item.itemId));
  const ids = (
    requested.length > 0 ? requested : training.assessmentItems.map((item) => item.itemId)
  ).filter((itemId) => available.has(itemId));
  return [...new Set(ids)];
}

function thresholdFor(training: TrainingState): number {
  return training.assessmentBlueprint?.passThreshold ?? training.mastery.passThreshold;
}

function maxAttemptsFor(training: TrainingState): number {
  return Math.max(1, training.assessmentBlueprint?.maxAttempts ?? training.mastery.maxAttempts);
}

export function startTrainingSession(
  training: TrainingState,
  guideId: string,
  learnerId: string,
  startedAtIso?: string,
): TrainingSession {
  const createdAtIso = nowIso(startedAtIso);
  return {
    sessionId: `training-session-${guideId}-${learnerId}`,
    guideId,
    learnerId,
    blueprintId: training.assessmentBlueprint?.blueprintId ?? null,
    itemIds: itemIdsFor(training),
    responses: {},
    currentItemIndex: 0,
    attempts: [],
    status: 'in-progress',
    createdAtIso,
    updatedAtIso: createdAtIso,
  };
}

function copyResponse(response: TrainingResponse): TrainingResponse {
  return Array.isArray(response) ? [...response] : response;
}

/** Record one answer without scoring or contacting a provider. */
export function answerTrainingItem(
  session: TrainingSession,
  itemId: EntityId,
  response: TrainingResponse,
  answeredAtIso?: string,
): TrainingSession {
  if (session.status === 'mastered')
    throw new Error('mastered training sessions cannot be changed');
  if (!session.itemIds.includes(itemId)) throw new Error(`unknown training item ${itemId}`);
  const responses = Object.fromEntries(
    Object.entries(session.responses).map(([key, value]) => [key, copyResponse(value)]),
  );
  responses[itemId] = copyResponse(response);
  const currentItemIndex = session.itemIds.findIndex(
    (candidate) => responses[candidate] === undefined,
  );
  return {
    ...session,
    responses,
    currentItemIndex: currentItemIndex < 0 ? session.itemIds.length : currentItemIndex,
    updatedAtIso: nowIso(answeredAtIso),
  };
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value as string[];
}

function scoreItem(item: AssessmentItem, response: TrainingResponse): boolean {
  if (response === null) return false;
  const rule = item.scoringRule;
  const correctOptionIds =
    stringArray(rule.correctOptionIds) ??
    stringArray(rule.correct) ??
    (typeof rule.correctOptionId === 'string' ? [rule.correctOptionId] : null);

  if (item.interaction === 'single-choice') {
    return (
      typeof response === 'string' &&
      correctOptionIds?.length === 1 &&
      response === correctOptionIds[0]
    );
  }
  if (item.interaction === 'multiple-response' || item.interaction === 'ordering') {
    if (!Array.isArray(response) || !correctOptionIds) return false;
    return (
      response.length === correctOptionIds.length &&
      response.every((value, index) => value === correctOptionIds[index])
    );
  }
  if (item.interaction === 'numeric') {
    if (typeof response !== 'number') return false;
    const expected =
      typeof rule.value === 'number'
        ? rule.value
        : typeof rule.correct === 'number'
          ? rule.correct
          : null;
    const tolerance = typeof rule.tolerance === 'number' ? Math.abs(rule.tolerance) : 0;
    return expected !== null && Math.abs(response - expected) <= tolerance;
  }
  if (item.interaction === 'short-answer') {
    if (typeof response !== 'string') return false;
    const accepted = stringArray(rule.acceptedAnswers) ?? stringArray(rule.acceptedPhrases) ?? [];
    return accepted.some((answer) => normalized(answer) === normalized(response));
  }
  return false;
}

function remediationFor(training: TrainingState, itemId: EntityId): EntityId[] {
  return (training.remediationEdges ?? [])
    .filter((edge) => edge.fromItemId === itemId && edge.trigger === 'incorrect')
    .map((edge) => edge.toActivityId);
}

function outcomeFor(
  objectiveId: EntityId,
  itemResults: TrainingItemResult[],
  threshold: number,
): TrainingObjectiveOutcome {
  const results = itemResults.filter((result) => result.objectiveId === objectiveId);
  const score =
    results.length === 0
      ? 0
      : results.reduce((sum, result) => sum + result.score, 0) / results.length;
  return {
    objectiveId,
    itemIds: results.map((result) => result.itemId),
    score,
    passed: results.length > 0 && score >= threshold,
  };
}

/** Score a complete attempt with a stable, provider-free mastery rule. */
export function submitTrainingAttempt(
  training: TrainingState,
  session: TrainingSession,
  submittedAtIso?: string,
): TrainingAttemptResult {
  if (session.status === 'mastered') throw new Error('training session is already mastered');
  if (session.itemIds.length === 0) throw new Error('training program has no assessment items');
  const maxAttempts = maxAttemptsFor(training);
  if (session.attempts.length >= maxAttempts) throw new Error('training attempt limit reached');

  const submitted = nowIso(submittedAtIso);
  const itemById = new Map(training.assessmentItems.map((item) => [item.itemId, item]));
  const itemResults = session.itemIds.map((itemId) => {
    const item = itemById.get(itemId);
    if (!item) throw new Error(`training item disappeared: ${itemId}`);
    const response = session.responses[itemId] ?? null;
    const correct = scoreItem(item, response);
    return {
      itemId,
      objectiveId: item.objectiveId,
      response: copyResponse(response),
      correct,
      score: correct ? 1 : 0,
      remediationActivityIds: correct ? [] : remediationFor(training, itemId),
    } satisfies TrainingItemResult;
  });
  const threshold = thresholdFor(training);
  const score = itemResults.reduce((sum, result) => sum + result.score, 0) / itemResults.length;
  const objectiveIds = training.mastery.requiredObjectiveIds?.length
    ? training.mastery.requiredObjectiveIds
    : (training.assessmentBlueprint?.objectiveIds ?? [
        ...new Set(itemResults.map((result) => result.objectiveId)),
      ]);
  const objectiveOutcomes = objectiveIds.map((objectiveId) =>
    outcomeFor(objectiveId, itemResults, threshold),
  );
  const criticalItemIds = new Set(
    training.mastery.criticalItemIds ?? training.assessmentBlueprint?.criticalItemIds ?? [],
  );
  const criticalItemsPassed = itemResults.filter(
    (result) => criticalItemIds.has(result.itemId) && result.correct,
  ).length;
  const requiredCriticalItems = Math.min(
    training.mastery.requiredCriticalItems,
    criticalItemIds.size,
  );
  const passed =
    score >= threshold &&
    criticalItemsPassed >= requiredCriticalItems &&
    objectiveOutcomes.every((outcome) => outcome.passed);
  const remediationActivityIds = [
    ...new Set(itemResults.flatMap((result) => result.remediationActivityIds)),
  ];
  const status: TrainingAttempt['status'] = passed
    ? 'mastered'
    : remediationActivityIds.length > 0 && session.attempts.length + 1 < maxAttempts
      ? 'remediation'
      : 'failed';
  const attempt: TrainingAttempt = {
    attemptId: `${session.sessionId}-attempt-${session.attempts.length + 1}`,
    attemptNumber: session.attempts.length + 1,
    startedAtIso: session.attempts.at(-1)?.submittedAtIso ?? session.createdAtIso,
    submittedAtIso: submitted,
    itemResults,
    objectiveOutcomes,
    score,
    passed,
    criticalItemsPassed,
    remediationActivityIds,
    status,
  };
  const nextSession: TrainingSession = {
    ...session,
    responses: {},
    currentItemIndex: 0,
    attempts: [...session.attempts, attempt],
    status,
    updatedAtIso: submitted,
  };
  return { session: nextSession, attempt };
}

export function beginTrainingRetest(
  training: TrainingState,
  session: TrainingSession,
  startedAtIso?: string,
): TrainingSession {
  if (session.status === 'mastered')
    throw new Error('mastered training sessions cannot be retested');
  if (session.attempts.length >= maxAttemptsFor(training))
    throw new Error('training attempt limit reached');
  return {
    ...session,
    responses: {},
    currentItemIndex: 0,
    status: 'in-progress',
    updatedAtIso: nowIso(startedAtIso),
  };
}

export function trainingEvents(session: TrainingSession): TrainingEvent[] {
  const events: TrainingEvent[] = [
    {
      eventId: `${session.sessionId}-initialized`,
      type: 'initialized',
      sessionId: session.sessionId,
      activityIds: [],
      occurredAtIso: session.createdAtIso,
      data: { itemCount: session.itemIds.length },
    },
  ];
  for (const attempt of session.attempts) {
    for (const result of attempt.itemResults) {
      events.push({
        eventId: `${attempt.attemptId}-${result.itemId}-answered`,
        type: 'answered',
        sessionId: session.sessionId,
        attemptId: attempt.attemptId,
        itemId: result.itemId,
        activityIds: result.remediationActivityIds,
        occurredAtIso: attempt.submittedAtIso,
        data: { correct: result.correct, score: result.score },
      });
    }
    events.push({
      eventId: `${attempt.attemptId}-submitted`,
      type: 'attempt-submitted',
      sessionId: session.sessionId,
      attemptId: attempt.attemptId,
      activityIds: attempt.remediationActivityIds,
      occurredAtIso: attempt.submittedAtIso,
      data: { attemptNumber: attempt.attemptNumber, score: attempt.score, passed: attempt.passed },
    });
    if (attempt.status === 'mastered') {
      events.push({
        eventId: `${attempt.attemptId}-mastered`,
        type: 'mastered',
        sessionId: session.sessionId,
        attemptId: attempt.attemptId,
        activityIds: [],
        occurredAtIso: attempt.submittedAtIso,
        data: { score: attempt.score },
      });
    }
  }
  return events;
}

export interface XapiStatement {
  id: string;
  actor: {
    objectType: 'Agent';
    account: { homepage: string; name: string };
  };
  verb: { id: string; display: { 'en-US': string } };
  object: {
    objectType: 'Activity';
    id: string;
    definition: {
      name: { 'en-US': string };
      type: string;
    };
  };
  result?: {
    success?: boolean;
    completion?: boolean;
    score?: { scaled: number; raw: number };
    response?: string;
  };
  context: { registration: string; contextActivities: { grouping: { id: string }[] } };
  timestamp: string;
  version: '1.0.3';
}

export interface XapiExportOptions {
  actorHomepage?: string;
  activityHomepage?: string;
}

function xapiStatement(
  session: TrainingSession,
  eventId: string,
  verbId: string,
  display: string,
  objectId: string,
  objectName: string,
  occurredAtIso: string,
  options: XapiExportOptions,
  result?: XapiStatement['result'],
): XapiStatement {
  const activityHomepage = options.activityHomepage ?? 'https://guideforge.dev';
  const statement: XapiStatement = {
    id: eventId,
    actor: {
      objectType: 'Agent',
      account: {
        homepage: options.actorHomepage ?? 'https://guideforge.dev/learners',
        name: session.learnerId,
      },
    },
    verb: { id: `http://adlnet.gov/expapi/verbs/${verbId}`, display: { 'en-US': display } },
    object: {
      objectType: 'Activity',
      id: `${activityHomepage}/guides/${encodeURIComponent(session.guideId)}/${objectId}`,
      definition: {
        name: { 'en-US': objectName },
        type: 'http://adlnet.gov/expapi/activities/assessment',
      },
    },
    context: {
      registration: session.sessionId,
      contextActivities: {
        grouping: [{ id: `${activityHomepage}/guides/${encodeURIComponent(session.guideId)}` }],
      },
    },
    timestamp: occurredAtIso,
    version: '1.0.3',
    ...(result ? { result } : {}),
  };
  return statement;
}

export function trainingToXapiStatements(
  session: TrainingSession,
  options: XapiExportOptions = {},
): XapiStatement[] {
  const statements: XapiStatement[] = [
    xapiStatement(
      session,
      `${session.sessionId}-initialized`,
      'initialized',
      'initialized',
      'training',
      'GuideForge training session',
      session.createdAtIso,
      options,
      { completion: false },
    ),
  ];
  for (const attempt of session.attempts) {
    for (const result of attempt.itemResults) {
      statements.push(
        xapiStatement(
          session,
          `${attempt.attemptId}-${result.itemId}-answered`,
          'answered',
          'answered',
          `items/${result.itemId}`,
          `Training item ${result.itemId}`,
          attempt.submittedAtIso,
          options,
          {
            success: result.correct,
            score: { scaled: result.score, raw: result.score },
            response: JSON.stringify(result.response),
          },
        ),
      );
    }
    statements.push(
      xapiStatement(
        session,
        `${attempt.attemptId}-outcome`,
        attempt.passed ? 'passed' : 'failed',
        attempt.passed ? 'passed' : 'failed',
        `attempts/${attempt.attemptNumber}`,
        `Training attempt ${attempt.attemptNumber}`,
        attempt.submittedAtIso,
        options,
        {
          success: attempt.passed,
          completion: true,
          score: { scaled: attempt.score, raw: attempt.score },
        },
      ),
    );
  }
  if (session.status === 'mastered') {
    const last = session.attempts.at(-1);
    if (last) {
      statements.push(
        xapiStatement(
          session,
          `${last.attemptId}-completed`,
          'completed',
          'completed',
          'training',
          'GuideForge training session',
          last.submittedAtIso,
          options,
          { success: true, completion: true, score: { scaled: last.score, raw: last.score } },
        ),
      );
    }
  }
  return statements;
}

export function exportXapiJson(session: TrainingSession, options: XapiExportOptions = {}): string {
  return JSON.stringify(trainingToXapiStatements(session, options), null, 2);
}
