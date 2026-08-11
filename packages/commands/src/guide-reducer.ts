/**
 * Pure command reducers for guide state.
 *
 * `applyGuideCommand` returns a NEW snapshot (immutable update) for a
 * validated command. It is used by:
 *  - unit/property tests (pure state model),
 *  - the Yjs materialization layer (to derive canonical snapshots),
 *  - migration and import paths.
 *
 * All reducers are deterministic: same (state, command) => same output.
 */
import type { EntityId } from '@guideforge/domain';
import {
  createEmptyScene,
  createEmptyTraining,
  type GuideSnapshot,
  type GuideTask,
} from '@guideforge/guide-schema';
import {
  GUIDE_COMMAND_TYPES,
  findTask,
  type AddAssessmentItemPayload,
  type AddObjectivePayload,
  type AddStepPayload,
  type AddTaskPayload,
  type RemoveStepPayload,
  type RemoveTaskPayload,
  type RenameTaskPayload,
  type ReorderTasksPayload,
} from './guide-commands.js';
import type { GuideCommand } from './index.js';

function cloneSnapshot(s: GuideSnapshot): GuideSnapshot {
  return {
    ...s,
    tasks: s.tasks.map((t) => ({ ...t, stepIds: [...t.stepIds] })),
    steps: s.steps.map((st) => ({
      ...st,
      warnings: st.warnings.map((w) => ({ ...w })),
      tools: st.tools.map((t) => ({ ...t })),
      parts: st.parts.map((p) => ({ ...p })),
      values: st.values.map((v) => ({ ...v })),
      conditions: st.conditions.map((c) => ({ ...c })),
      verification: st.verification.map((v) => ({ ...v })),
      media: st.media.map((m) => ({ ...m })),
    })),
    // Deep-clone the canonical scene + training so reducer mutations never
    // alias the previous state (Phase 02 canonical structures).
    scene: JSON.parse(JSON.stringify(s.scene)) as GuideSnapshot['scene'],
    training: JSON.parse(JSON.stringify(s.training)) as GuideSnapshot['training'],
  };
}

export function applyGuideCommand(state: GuideSnapshot, command: GuideCommand): GuideSnapshot {
  switch (command.commandType) {
    case GUIDE_COMMAND_TYPES.addTask: {
      const p = command.payload as AddTaskPayload;
      if (findTask(state, p.taskId)) return state;
      const next = cloneSnapshot(state);
      next.tasks.push({ taskId: p.taskId, title: p.title, stepIds: [] });
      return next;
    }
    case GUIDE_COMMAND_TYPES.setTitle: {
      const p = command.payload as { title: string };
      if (p.title === state.title) return state;
      const next = cloneSnapshot(state);
      next.title = p.title;
      return next;
    }
    case GUIDE_COMMAND_TYPES.renameTask: {
      const p = command.payload as RenameTaskPayload;
      const next = cloneSnapshot(state);
      const task = next.tasks.find((t) => t.taskId === p.taskId);
      if (!task) return state;
      task.title = p.title;
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeTask: {
      const p = command.payload as RemoveTaskPayload;
      if (!findTask(state, p.taskId)) return state;
      const next = cloneSnapshot(state);
      next.tasks = next.tasks.filter((t) => t.taskId !== p.taskId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.reorderTasks: {
      const p = command.payload as ReorderTasksPayload;
      if (p.orderedTaskIds.length !== state.tasks.length) return state;
      const byId = new Map(state.tasks.map((t) => [t.taskId, t]));
      const reordered: GuideTask[] = [];
      for (const id of p.orderedTaskIds) {
        const task = byId.get(id);
        if (!task) return state; // not a permutation -> no-op
        reordered.push(task);
      }
      const next = cloneSnapshot(state);
      next.tasks = reordered;
      return next;
    }
    case GUIDE_COMMAND_TYPES.addStep: {
      const p = command.payload as AddStepPayload;
      const next = cloneSnapshot(state);
      const task = next.tasks.find((t) => t.taskId === p.taskId);
      if (!task) return state;
      if (task.stepIds.includes(p.stepId)) return state;
      task.stepIds.push(p.stepId);
      next.steps.push({
        stepId: p.stepId,
        taskId: p.taskId,
        instructionText: p.title,
        warnings: [],
        tools: [],
        parts: [],
        values: [],
        conditions: [],
        verification: [],
        media: [],
      });
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeStep: {
      const p = command.payload as RemoveStepPayload;
      const next = cloneSnapshot(state);
      const task = next.tasks.find((t) => t.taskId === p.taskId);
      if (!task) return state;
      task.stepIds = task.stepIds.filter((id) => id !== p.stepId);
      next.steps = next.steps.filter((s) => s.stepId !== p.stepId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.setStepText: {
      const p = command.payload as { stepId: EntityId; text: string };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      step.instructionText = p.text;
      return next;
    }
    case GUIDE_COMMAND_TYPES.addWarning: {
      const p = command.payload as {
        stepId: EntityId;
        warningId: EntityId;
        severity: 'info' | 'warning' | 'critical';
        message: string;
      };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      if (step.warnings.some((w) => w.warningId === p.warningId)) return state;
      step.warnings.push({ warningId: p.warningId, severity: p.severity, message: p.message });
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeWarning: {
      const p = command.payload as { stepId: EntityId; warningId: EntityId };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      step.warnings = step.warnings.filter((w) => w.warningId !== p.warningId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.addTool: {
      const p = command.payload as { stepId: EntityId; toolId: EntityId; name: string };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      if (step.tools.some((t) => t.toolId === p.toolId)) return state;
      step.tools.push({ toolId: p.toolId, name: p.name });
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeTool: {
      const p = command.payload as { stepId: EntityId; toolId: EntityId };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      step.tools = step.tools.filter((t) => t.toolId !== p.toolId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.addPart: {
      const p = command.payload as {
        stepId: EntityId;
        partId: EntityId;
        name: string;
        quantity: number;
      };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      if (step.parts.some((pt) => pt.partId === p.partId)) return state;
      step.parts.push({ partId: p.partId, name: p.name, quantity: p.quantity });
      return next;
    }
    case GUIDE_COMMAND_TYPES.removePart: {
      const p = command.payload as { stepId: EntityId; partId: EntityId };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      step.parts = step.parts.filter((pt) => pt.partId !== p.partId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.addValue: {
      const p = command.payload as {
        stepId: EntityId;
        valueId: EntityId;
        label: string;
        value: string;
        unit?: string;
      };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      if (step.values.some((v) => v.valueId === p.valueId)) return state;
      step.values.push({
        valueId: p.valueId,
        label: p.label,
        value: p.value,
        ...(p.unit ? { unit: p.unit } : {}),
      });
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeValue: {
      const p = command.payload as { stepId: EntityId; valueId: EntityId };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      step.values = step.values.filter((v) => v.valueId !== p.valueId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.addCondition: {
      const p = command.payload as { stepId: EntityId; conditionId: EntityId; text: string };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      if (step.conditions.some((c) => c.conditionId === p.conditionId)) return state;
      step.conditions.push({ conditionId: p.conditionId, text: p.text });
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeCondition: {
      const p = command.payload as { stepId: EntityId; conditionId: EntityId };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      step.conditions = step.conditions.filter((c) => c.conditionId !== p.conditionId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.addVerification: {
      const p = command.payload as { stepId: EntityId; verificationId: EntityId; text: string };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      if (step.verification.some((v) => v.verificationId === p.verificationId)) return state;
      step.verification.push({ verificationId: p.verificationId, text: p.text });
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeVerification: {
      const p = command.payload as { stepId: EntityId; verificationId: EntityId };
      const next = cloneSnapshot(state);
      const step = next.steps.find((s) => s.stepId === p.stepId);
      if (!step) return state;
      step.verification = step.verification.filter((v) => v.verificationId !== p.verificationId);
      return next;
    }
    case GUIDE_COMMAND_TYPES.addObjective: {
      const p = command.payload as AddObjectivePayload;
      if (state.training.objectives.some((o) => o.objectiveId === p.objectiveId)) return state;
      const next = cloneSnapshot(state);
      next.training.objectives.push({
        objectiveId: p.objectiveId,
        verb: p.verb,
        target: p.target,
        conditions: p.conditions,
        criterion: p.criterion,
        stepIds: [...p.stepIds],
        citations: [...p.citations],
        criticality: p.criticality,
      });
      return next;
    }
    case GUIDE_COMMAND_TYPES.addAssessmentItem: {
      const p = command.payload as AddAssessmentItemPayload;
      if (state.training.assessmentItems.some((i) => i.itemId === p.itemId)) return state;
      const next = cloneSnapshot(state);
      next.training.assessmentItems.push({
        itemId: p.itemId,
        objectiveId: p.objectiveId,
        prompt: p.prompt,
        interaction: p.interaction,
        options: p.options.map((o) => ({ ...o })),
        scoringRule: { ...p.scoringRule },
        rationale: p.rationale,
        citations: [...p.citations],
        criticality: p.criticality,
        reviewState: 'draft',
      });
      return next;
    }
    default:
      return state;
  }
}

export function applyCommands(
  state: GuideSnapshot,
  commands: readonly GuideCommand[],
): GuideSnapshot {
  let current = state;
  for (const command of commands) {
    current = applyGuideCommand(current, command);
  }
  return current;
}

export function freshGuideState(guideId: EntityId, title: string): GuideSnapshot {
  const now = new Date(0).toISOString(); // deterministic epoch for tests
  return {
    schemaVersion: 3,
    guideId,
    title,
    description: '',
    lifecycleState: 'draft',
    createdAtIso: now,
    updatedAtIso: now,
    tasks: [],
    steps: [],
    scene: createEmptyScene(),
    training: createEmptyTraining(),
    sources: [],
  };
}
