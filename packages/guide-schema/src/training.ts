import type { EntityId } from '@guideforge/domain';
import type {
  GuideSnapshot,
  TrainingActivity,
  TrainingAssessmentBlueprint,
  TrainingCitation,
  TrainingCompetency,
  TrainingCriticality,
  TrainingRemediationEdge,
  TrainingState,
} from './index.js';

export interface TrainingQualityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  entityId?: EntityId;
}

export interface TrainingQualityReport {
  ok: boolean;
  issues: TrainingQualityIssue[];
  coverage: {
    procedureSteps: number;
    linkedSteps: number;
    objectives: number;
    sourceGroundedObjectives: number;
    assessmentItems: number;
    sourceGroundedItems: number;
    reviewedItems: number;
    activities: number;
    remediationEdges: number;
  };
}

export interface TrainingGenerationResult {
  training: TrainingState;
  quality: TrainingQualityReport;
}

function issue(
  issues: TrainingQualityIssue[],
  code: string,
  severity: TrainingQualityIssue['severity'],
  message: string,
  entityId?: EntityId,
): void {
  issues.push({ code, severity, message, ...(entityId ? { entityId } : {}) });
}

function uniqueCitations(citations: TrainingCitation[]): TrainingCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.sourceHash}:${citation.regionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function citationKey(citation: TrainingCitation): string {
  return `${citation.sourceHash}:${citation.regionId}`;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function stepCitations(snapshot: GuideSnapshot, stepId: EntityId): TrainingCitation[] {
  const step = snapshot.steps.find((candidate) => candidate.stepId === stepId);
  if (!step) return [];

  const claimIds = new Set(step.claimIds);
  const graphCitations = snapshot.citations
    .filter((citation) => claimIds.has(citation.claimId))
    .map((citation) => ({ sourceHash: citation.sourceHash, regionId: citation.regionId }));
  if (graphCitations.length > 0) return uniqueCitations(graphCitations);

  // Conservative recovery for imported procedures whose claim graph was not
  // retained: only an exact normalized excerpt/step match may create a link.
  const instruction = normalized(step.instructionText);
  if (instruction.length < 12) return [];
  for (const source of snapshot.sources) {
    for (const region of source.regions) {
      const excerpt = normalized(region.text ?? '');
      if (
        excerpt.length >= 12 &&
        (excerpt.includes(instruction) || instruction.includes(excerpt))
      ) {
        return [{ sourceHash: region.sourceHash, regionId: region.regionId }];
      }
    }
  }
  return [];
}

function citationsForSteps(snapshot: GuideSnapshot, stepIds: EntityId[]): TrainingCitation[] {
  return uniqueCitations(stepIds.flatMap((stepId) => stepCitations(snapshot, stepId)));
}

function validSourceCitations(snapshot: GuideSnapshot): Set<string> {
  return new Set(
    snapshot.sources.flatMap((source) =>
      source.regions.map((region) => `${region.sourceHash}:${region.regionId}`),
    ),
  );
}

function checkCitations(
  citations: TrainingCitation[],
  owner: string,
  issues: TrainingQualityIssue[],
  sourceKeys: Set<string>,
): boolean {
  if (citations.length === 0) {
    issue(issues, 'missing-citation', 'error', `${owner} has no source-region citation`);
    return false;
  }
  let valid = true;
  for (const citation of citations) {
    if (!sourceKeys.has(citationKey(citation))) {
      issue(
        issues,
        'invalid-citation',
        'error',
        `${owner} cites missing source region ${citation.regionId}`,
      );
      valid = false;
    }
  }
  return valid;
}

function allIds(training: TrainingState): string[] {
  return [
    ...(training.competencies ?? []).map((item) => item.competencyId),
    ...training.objectives.map((item) => item.objectiveId),
    ...training.modules.map((item) => item.moduleId),
    ...training.lessons.map((item) => item.lessonId),
    ...(training.activities ?? []).map((item) => item.activityId),
    ...training.assessmentItems.map((item) => item.itemId),
    ...(training.remediationEdges ?? []).map((item) => item.edgeId),
    ...(training.assessmentBlueprint ? [training.assessmentBlueprint.blueprintId] : []),
  ];
}

/**
 * Validate the authored training graph without trusting generated text.
 * Every answer key, rationale, and feedback item must resolve to a real
 * canonical source region before the report can pass.
 */
export function validateTrainingProgram(
  training: TrainingState,
  snapshot: GuideSnapshot,
): TrainingQualityReport {
  const issues: TrainingQualityIssue[] = [];
  const sourceKeys = validSourceCitations(snapshot);
  const stepIds = new Set(snapshot.steps.map((step) => step.stepId));
  const objectiveIds = new Set(training.objectives.map((objective) => objective.objectiveId));
  const lessonIds = new Set(training.lessons.map((lesson) => lesson.lessonId));
  const activityIds = new Set((training.activities ?? []).map((activity) => activity.activityId));
  const itemIds = new Set(training.assessmentItems.map((item) => item.itemId));
  const competencyIds = new Set(
    (training.competencies ?? []).map((competency) => competency.competencyId),
  );
  const idList = allIds(training);
  if (new Set(idList).size !== idList.length) {
    issue(issues, 'duplicate-id', 'error', 'training ids must be unique');
  }

  const linkedStepIds = new Set<EntityId>();
  let sourceGroundedObjectives = 0;
  for (const objective of training.objectives) {
    if (!objective.verb.trim() || !objective.target.trim() || !objective.criterion.trim()) {
      issue(
        issues,
        'incomplete-objective',
        'error',
        'objective needs verb, target, and criterion',
        objective.objectiveId,
      );
    }
    if (objective.stepIds.length === 0) {
      issue(
        issues,
        'objective-without-step',
        'error',
        'objective must link to a procedure step',
        objective.objectiveId,
      );
    }
    for (const stepId of objective.stepIds) {
      if (!stepIds.has(stepId)) {
        issue(
          issues,
          'missing-step',
          'error',
          `objective links missing step ${stepId}`,
          objective.objectiveId,
        );
      } else {
        linkedStepIds.add(stepId);
      }
    }
    if (objective.competencyId && !competencyIds.has(objective.competencyId)) {
      issue(
        issues,
        'missing-competency',
        'error',
        `objective links missing competency ${objective.competencyId}`,
        objective.objectiveId,
      );
    }
    if (
      checkCitations(objective.citations, `objective ${objective.objectiveId}`, issues, sourceKeys)
    ) {
      sourceGroundedObjectives += 1;
    }
  }

  for (const competency of training.competencies ?? []) {
    if (!competency.title.trim() || !competency.description.trim()) {
      issue(
        issues,
        'incomplete-competency',
        'error',
        'competency needs title and description',
        competency.competencyId,
      );
    }
    for (const objectiveId of competency.objectiveIds) {
      if (!objectiveIds.has(objectiveId)) {
        issue(
          issues,
          'missing-objective',
          'error',
          `competency links missing objective ${objectiveId}`,
          competency.competencyId,
        );
      }
    }
    checkCitations(
      competency.citations,
      `competency ${competency.competencyId}`,
      issues,
      sourceKeys,
    );
  }

  for (const module of training.modules) {
    if (!module.title.trim())
      issue(issues, 'incomplete-module', 'error', 'module needs a title', module.moduleId);
    for (const objectiveId of module.objectiveIds) {
      if (!objectiveIds.has(objectiveId))
        issue(
          issues,
          'missing-objective',
          'error',
          `module links missing objective ${objectiveId}`,
          module.moduleId,
        );
    }
    for (const lessonId of module.lessonIds) {
      if (!lessonIds.has(lessonId))
        issue(
          issues,
          'missing-lesson',
          'error',
          `module links missing lesson ${lessonId}`,
          module.moduleId,
        );
    }
    for (const competencyId of module.competencyIds ?? []) {
      if (!competencyIds.has(competencyId))
        issue(
          issues,
          'missing-competency',
          'error',
          `module links missing competency ${competencyId}`,
          module.moduleId,
        );
    }
  }

  for (const lesson of training.lessons) {
    if (!lesson.title.trim())
      issue(issues, 'incomplete-lesson', 'error', 'lesson needs a title', lesson.lessonId);
    for (const stepId of lesson.stepIds) {
      if (!stepIds.has(stepId))
        issue(
          issues,
          'missing-step',
          'error',
          `lesson links missing step ${stepId}`,
          lesson.lessonId,
        );
      else linkedStepIds.add(stepId);
    }
    for (const objectiveId of lesson.objectiveIds) {
      if (!objectiveIds.has(objectiveId))
        issue(
          issues,
          'missing-objective',
          'error',
          `lesson links missing objective ${objectiveId}`,
          lesson.lessonId,
        );
    }
    for (const activityId of lesson.activityIds ?? []) {
      if (!activityIds.has(activityId))
        issue(
          issues,
          'missing-activity',
          'error',
          `lesson links missing activity ${activityId}`,
          lesson.lessonId,
        );
    }
    checkCitations(lesson.citations, `lesson ${lesson.lessonId}`, issues, sourceKeys);
  }

  for (const activity of training.activities ?? []) {
    if (!activity.title.trim())
      issue(issues, 'incomplete-activity', 'error', 'activity needs a title', activity.activityId);
    if (!lessonIds.has(activity.lessonId))
      issue(
        issues,
        'missing-lesson',
        'error',
        `activity links missing lesson ${activity.lessonId}`,
        activity.activityId,
      );
    for (const stepId of activity.stepIds) {
      if (!stepIds.has(stepId))
        issue(
          issues,
          'missing-step',
          'error',
          `activity links missing step ${stepId}`,
          activity.activityId,
        );
      else linkedStepIds.add(stepId);
    }
    for (const objectiveId of activity.objectiveIds) {
      if (!objectiveIds.has(objectiveId))
        issue(
          issues,
          'missing-objective',
          'error',
          `activity links missing objective ${objectiveId}`,
          activity.activityId,
        );
    }
    for (const itemId of activity.itemIds) {
      if (!itemIds.has(itemId))
        issue(
          issues,
          'missing-item',
          'error',
          `activity links missing item ${itemId}`,
          activity.activityId,
        );
    }
    checkCitations(activity.citations, `activity ${activity.activityId}`, issues, sourceKeys);
  }

  let sourceGroundedItems = 0;
  let reviewedItems = 0;
  for (const item of training.assessmentItems) {
    if (!item.prompt.trim() || !item.rationale.trim()) {
      issue(
        issues,
        'incomplete-item',
        'error',
        'assessment item needs prompt and rationale',
        item.itemId,
      );
    }
    if (!item.feedback?.correct.trim() || !item.feedback.incorrect.trim()) {
      issue(
        issues,
        'missing-feedback',
        'error',
        'assessment item needs correct and incorrect feedback',
        item.itemId,
      );
    }
    if (!objectiveIds.has(item.objectiveId))
      issue(
        issues,
        'missing-objective',
        'error',
        `item links missing objective ${item.objectiveId}`,
        item.itemId,
      );
    const rule = item.scoringRule;
    if (!Array.isArray(rule.correctOptionIds) && !Array.isArray(rule.acceptedPhrases)) {
      issue(
        issues,
        'missing-answer-key',
        'error',
        'assessment item has no deterministic answer key',
        item.itemId,
      );
    }
    if (
      (item.interaction === 'single-choice' || item.interaction === 'multiple-response') &&
      item.options.length < 2
    ) {
      issue(
        issues,
        'insufficient-options',
        'error',
        'choice item needs at least two options',
        item.itemId,
      );
    }
    const grounded = checkCitations(
      item.citations,
      `assessment item ${item.itemId}`,
      issues,
      sourceKeys,
    );
    if (grounded) sourceGroundedItems += 1;
    if (item.reviewState === 'reviewed') reviewedItems += 1;
  }

  const blueprint = training.assessmentBlueprint;
  if (!blueprint) {
    issue(issues, 'missing-blueprint', 'error', 'training program needs an assessment blueprint');
  } else {
    if (blueprint.itemIds.length === 0)
      issue(
        issues,
        'empty-blueprint',
        'error',
        'assessment blueprint has no items',
        blueprint.blueprintId,
      );
    for (const itemId of blueprint.itemIds) {
      if (!itemIds.has(itemId))
        issue(
          issues,
          'missing-item',
          'error',
          `blueprint links missing item ${itemId}`,
          blueprint.blueprintId,
        );
    }
    for (const objectiveId of blueprint.objectiveIds) {
      if (!objectiveIds.has(objectiveId))
        issue(
          issues,
          'missing-objective',
          'error',
          `blueprint links missing objective ${objectiveId}`,
          blueprint.blueprintId,
        );
    }
    if (blueprint.passThreshold < 0 || blueprint.passThreshold > 1 || blueprint.maxAttempts < 1) {
      issue(
        issues,
        'invalid-blueprint-policy',
        'error',
        'blueprint mastery policy is invalid',
        blueprint.blueprintId,
      );
    }
    checkCitations(blueprint.citations, `blueprint ${blueprint.blueprintId}`, issues, sourceKeys);
  }

  for (const edge of training.remediationEdges ?? []) {
    if (!itemIds.has(edge.fromItemId))
      issue(
        issues,
        'missing-item',
        'error',
        `remediation starts at missing item ${edge.fromItemId}`,
        edge.edgeId,
      );
    if (!activityIds.has(edge.toActivityId))
      issue(
        issues,
        'missing-activity',
        'error',
        `remediation points to missing activity ${edge.toActivityId}`,
        edge.edgeId,
      );
    if (!edge.reason.trim())
      issue(issues, 'empty-remediation', 'error', 'remediation edge needs a reason', edge.edgeId);
    checkCitations(edge.citations, `remediation ${edge.edgeId}`, issues, sourceKeys);
  }

  const mastery = training.mastery;
  if (mastery.passThreshold < 0 || mastery.passThreshold > 1 || mastery.maxAttempts < 1) {
    issue(
      issues,
      'invalid-mastery-policy',
      'error',
      'mastery policy has invalid threshold or attempts',
    );
  }
  if (training.objectives.length === 0 && snapshot.steps.length > 0) {
    issue(
      issues,
      'no-objectives',
      'error',
      'procedure steps have no measurable training objectives',
    );
  }
  if (training.assessmentItems.length === 0 && snapshot.steps.length > 0) {
    issue(issues, 'no-assessment-items', 'error', 'procedure steps have no assessment items');
  }

  return {
    ok: issues.every((candidate) => candidate.severity !== 'error'),
    issues,
    coverage: {
      procedureSteps: snapshot.steps.length,
      linkedSteps: linkedStepIds.size,
      objectives: training.objectives.length,
      sourceGroundedObjectives,
      assessmentItems: training.assessmentItems.length,
      sourceGroundedItems,
      reviewedItems,
      activities: (training.activities ?? []).length,
      remediationEdges: (training.remediationEdges ?? []).length,
    },
  };
}

function criticalityForStep(snapshot: GuideSnapshot, stepId: EntityId): TrainingCriticality {
  const step = snapshot.steps.find((candidate) => candidate.stepId === stepId);
  return step?.warnings.some((warning) => warning.severity === 'critical') ? 'core' : 'important';
}

function activity(
  activityId: EntityId,
  lessonId: EntityId,
  title: string,
  type: TrainingActivity['type'],
  stepIds: EntityId[],
  objectiveIds: EntityId[],
  itemIds: EntityId[],
  citations: TrainingCitation[],
): TrainingActivity {
  return { activityId, lessonId, title, type, stepIds, objectiveIds, itemIds, citations };
}

/** Generate a complete, deterministic, source-grounded training draft from a procedure. */
export function generateTrainingFromProcedure(snapshot: GuideSnapshot): TrainingGenerationResult {
  const competencies: TrainingCompetency[] = [];
  const objectives: TrainingState['objectives'] = [];
  const modules: TrainingState['modules'] = [];
  const lessons: TrainingState['lessons'] = [];
  const activities: TrainingActivity[] = [];
  const assessmentItems: TrainingState['assessmentItems'] = [];
  const remediationEdges: TrainingRemediationEdge[] = [];

  for (const task of snapshot.tasks) {
    const taskSteps = task.stepIds.filter((stepId) =>
      snapshot.steps.some((step) => step.stepId === stepId),
    );
    const competencyId = `competency-${task.taskId}` as EntityId;
    const moduleId = `module-${task.taskId}` as EntityId;
    const lessonId = `lesson-${task.taskId}` as EntityId;
    const objectiveIds: EntityId[] = [];
    const taskCitations = citationsForSteps(snapshot, taskSteps);

    for (const stepId of taskSteps) {
      const step = snapshot.steps.find((candidate) => candidate.stepId === stepId)!;
      const objectiveId = `objective-${stepId}` as EntityId;
      const itemId = `item-${stepId}` as EntityId;
      const practiceActivityId = `activity-practice-${stepId}` as EntityId;
      const citations = stepCitations(snapshot, stepId);
      const criticality = criticalityForStep(snapshot, stepId);
      objectiveIds.push(objectiveId);
      objectives.push({
        objectiveId,
        competencyId,
        verb: 'perform',
        target: step.instructionText,
        conditions: 'Using the approved procedure and cited source.',
        criterion: 'Complete the instruction and its verification check.',
        stepIds: [stepId],
        citations,
        criticality,
      });
      const correctOptionId = `${itemId}-correct`;
      assessmentItems.push({
        itemId,
        objectiveId,
        prompt: `What is the documented action for this procedure step?`,
        interaction: 'single-choice',
        options: [
          { optionId: correctOptionId, text: step.instructionText },
          {
            optionId: `${itemId}-distractor`,
            text: 'Skip the step and continue without checking.',
          },
        ],
        scoringRule: { correctOptionIds: [correctOptionId] },
        rationale: `The approved procedure states: ${step.instructionText}`,
        feedback: {
          correct: 'Correct — this matches the cited procedure step.',
          incorrect: `Review the cited procedure step: ${step.instructionText}`,
        },
        citations,
        criticality,
        reviewState: 'draft',
      });
      activities.push(
        activity(
          practiceActivityId,
          lessonId,
          `Practice: ${step.instructionText}`,
          'practice',
          [stepId],
          [objectiveId],
          [itemId],
          citations,
        ),
      );
      remediationEdges.push({
        edgeId: `remediation-${itemId}` as EntityId,
        fromItemId: itemId,
        toActivityId: practiceActivityId,
        trigger: 'incorrect',
        reason: 'Review the linked procedure practice activity and retry.',
        citations,
      });
    }

    const instructionActivityId = `activity-instruction-${task.taskId}` as EntityId;
    activities.unshift(
      activity(
        instructionActivityId,
        lessonId,
        `Learn: ${task.title}`,
        'instruction',
        taskSteps,
        objectiveIds,
        [],
        taskCitations,
      ),
    );
    competencies.push({
      competencyId,
      title: task.title,
      description: `Perform and verify the ${task.title.toLowerCase()} procedure.`,
      objectiveIds,
      citations: taskCitations,
      criticality: objectiveIds.some(
        (objectiveId) =>
          objectives.find((objective) => objective.objectiveId === objectiveId)?.criticality ===
          'core',
      )
        ? 'core'
        : 'important',
    });
    lessons.push({
      lessonId,
      title: task.title,
      stepIds: taskSteps,
      objectiveIds,
      activityIds: [
        instructionActivityId,
        ...taskSteps.map((stepId) => `activity-practice-${stepId}` as EntityId),
      ],
      citations: taskCitations,
    });
    modules.push({
      moduleId,
      title: task.title,
      competencyIds: [competencyId],
      objectiveIds,
      lessonIds: [lessonId],
    });
  }

  const itemIds = assessmentItems.map((item) => item.itemId);
  const objectiveIds = objectives.map((objective) => objective.objectiveId);
  const criticalItemIds = assessmentItems
    .filter((item) => item.criticality === 'core')
    .map((item) => item.itemId);
  const allCitations = uniqueCitations(assessmentItems.flatMap((item) => item.citations));
  const assessmentBlueprint: TrainingAssessmentBlueprint = {
    blueprintId: `blueprint-${snapshot.guideId}` as EntityId,
    title: `${snapshot.title} assessment`,
    objectiveIds,
    itemIds,
    criticalItemIds,
    passThreshold: 0.8,
    maxAttempts: 3,
    citations: allCitations,
  };
  const training: TrainingState = {
    competencies,
    objectives,
    assessmentItems,
    modules,
    lessons,
    activities,
    assessmentBlueprint,
    remediationEdges,
    mastery: {
      requiredCriticalItems: criticalItemIds.length,
      passThreshold: 0.8,
      maxAttempts: 3,
      policyVersion: 'mastery-v1',
      requiredObjectiveIds: objectiveIds,
      criticalItemIds,
      remediationThreshold: 0.8,
    },
  };
  return { training, quality: validateTrainingProgram(training, snapshot) };
}
