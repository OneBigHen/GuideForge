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
import type { GuideSnapshot, GuideTask } from '@guideforge/guide-schema';
import {
  GUIDE_COMMAND_TYPES,
  findTask,
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
      return next;
    }
    case GUIDE_COMMAND_TYPES.removeStep: {
      const p = command.payload as RemoveStepPayload;
      const next = cloneSnapshot(state);
      const task = next.tasks.find((t) => t.taskId === p.taskId);
      if (!task) return state;
      task.stepIds = task.stepIds.filter((id) => id !== p.stepId);
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
    schemaVersion: 1,
    guideId,
    title,
    description: '',
    lifecycleState: 'draft',
    createdAtIso: now,
    updatedAtIso: now,
    tasks: [],
  };
}
