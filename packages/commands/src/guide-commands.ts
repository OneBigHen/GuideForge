import type { EntityId } from '@guideforge/domain';
import type { GuideSnapshot, GuideTask, TrainingState } from '@guideforge/guide-schema';
import type { GuideCommand } from './index.js';

/** State the guide commands operate on: the canonical snapshot. */
export type GuideState = GuideSnapshot;

export interface AddTaskPayload {
  taskId: EntityId;
  title: string;
}

export interface RenameTaskPayload {
  taskId: EntityId;
  title: string;
}

export interface RemoveTaskPayload {
  taskId: EntityId;
}

export interface ReorderTasksPayload {
  /** Full desired taskId order (must be a permutation of current ids). */
  orderedTaskIds: EntityId[];
}

export interface AddStepPayload {
  taskId: EntityId;
  stepId: EntityId;
  title: string;
}

export interface RemoveStepPayload {
  taskId: EntityId;
  stepId: EntityId;
}

export interface AddObjectivePayload {
  objectiveId: EntityId;
  verb: string;
  target: string;
  conditions: string;
  criterion: string;
  stepIds: EntityId[];
  citations: { sourceHash: string; regionId: string }[];
  criticality: 'core' | 'important' | 'supporting';
}

export interface AddAssessmentItemPayload {
  itemId: EntityId;
  objectiveId: EntityId;
  prompt: string;
  interaction: 'single-choice' | 'multiple-response' | 'ordering' | 'numeric' | 'short-answer';
  options: { optionId: string; text: string }[];
  scoringRule: Record<string, unknown>;
  rationale: string;
  citations: { sourceHash: string; regionId: string }[];
  criticality: 'core' | 'important' | 'supporting';
}

export interface ReplaceTrainingPayload {
  training: TrainingState;
}

export interface UpdateTrainingObjectivePayload {
  objectiveId: EntityId;
  verb?: string;
  target?: string;
  conditions?: string;
  criterion?: string;
}

export interface UpdateAssessmentItemPayload {
  itemId: EntityId;
  prompt?: string;
  rationale?: string;
  feedback?: { correct: string; incorrect: string };
}

export interface ReviewAssessmentItemPayload {
  itemId: EntityId;
  reviewState: 'draft' | 'reviewed';
}

export interface AddValuePayload {
  stepId: EntityId;
  valueId: EntityId;
  label: string;
  value: string;
  unit?: string;
}

export interface RemoveValuePayload {
  stepId: EntityId;
  valueId: EntityId;
}

export interface AddConditionPayload {
  stepId: EntityId;
  conditionId: EntityId;
  text: string;
}

export interface RemoveConditionPayload {
  stepId: EntityId;
  conditionId: EntityId;
}

export interface AddVerificationPayload {
  stepId: EntityId;
  verificationId: EntityId;
  text: string;
}

export interface RemoveVerificationPayload {
  stepId: EntityId;
  verificationId: EntityId;
}

export type GuideCommandPayloads =
  | AddTaskPayload
  | RenameTaskPayload
  | RemoveTaskPayload
  | ReorderTasksPayload
  | AddStepPayload
  | RemoveStepPayload
  | AddValuePayload
  | RemoveValuePayload
  | AddConditionPayload
  | RemoveConditionPayload
  | AddVerificationPayload
  | RemoveVerificationPayload
  | AddObjectivePayload
  | AddAssessmentItemPayload
  | ReplaceTrainingPayload
  | UpdateTrainingObjectivePayload
  | UpdateAssessmentItemPayload
  | ReviewAssessmentItemPayload;

export type GuideCommandOf<P> = GuideCommand<P>;

export const GUIDE_COMMAND_TYPES = {
  addTask: 'guide/add-task',
  renameTask: 'guide/rename-task',
  removeTask: 'guide/remove-task',
  reorderTasks: 'guide/reorder-tasks',
  addStep: 'guide/add-step',
  removeStep: 'guide/remove-step',
  setTitle: 'guide/set-title',
  setStepText: 'guide/set-step-text',
  addWarning: 'guide/add-warning',
  removeWarning: 'guide/remove-warning',
  addTool: 'guide/add-tool',
  removeTool: 'guide/remove-tool',
  addPart: 'guide/add-part',
  removePart: 'guide/remove-part',
  addValue: 'guide/add-value',
  removeValue: 'guide/remove-value',
  addCondition: 'guide/add-condition',
  removeCondition: 'guide/remove-condition',
  addVerification: 'guide/add-verification',
  removeVerification: 'guide/remove-verification',
  addObjective: 'training/add-objective',
  addAssessmentItem: 'training/add-assessment-item',
  replaceTraining: 'training/replace-program',
  updateTrainingObjective: 'training/update-objective',
  updateAssessmentItem: 'training/update-assessment-item',
  reviewAssessmentItem: 'training/review-assessment-item',
} as const;

export function findTask(state: GuideState, taskId: EntityId): GuideTask | undefined {
  return state.tasks.find((t) => t.taskId === taskId);
}
