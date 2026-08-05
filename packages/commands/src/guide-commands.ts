import type { EntityId } from '@guideforge/domain';
import type { GuideSnapshot, GuideTask } from '@guideforge/guide-schema';
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

export type GuideCommandPayloads =
  | AddTaskPayload
  | RenameTaskPayload
  | RemoveTaskPayload
  | ReorderTasksPayload
  | AddStepPayload
  | RemoveStepPayload;

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
  addObjective: 'training/add-objective',
  addAssessmentItem: 'training/add-assessment-item',
} as const;

export function findTask(state: GuideState, taskId: EntityId): GuideTask | undefined {
  return state.tasks.find((t) => t.taskId === taskId);
}
