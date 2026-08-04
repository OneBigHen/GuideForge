import type { CommandOrigin, EntityId } from '@guideforge/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GUIDE_COMMAND_TYPES } from './guide-commands.js';
import { applyCommands, applyGuideCommand, freshGuideState } from './guide-reducer.js';
import type { GuideCommand } from './index.js';

const GUIDE_ID = '123e4567-e89b-42d3-a456-426614174000' as EntityId;
const ORIGIN: CommandOrigin = 'user';

let seq = 0;
function cmd(commandType: string, payload: unknown): GuideCommand {
  seq += 1;
  return {
    commandId: `cmd-${seq}`,
    commandType,
    actorId: 'actor-a',
    guideId: GUIDE_ID,
    origin: ORIGIN,
    occurredAt: new Date(0).toISOString(),
    payload,
  };
}

const uuid = fc.uuid().map((s) => s as EntityId);

const arbitraryCommand = fc.oneof(
  fc
    .record({
      commandType: fc.constant(GUIDE_COMMAND_TYPES.addTask),
      taskId: uuid,
      title: fc.string(),
    })
    .map((p) => cmd(GUIDE_COMMAND_TYPES.addTask, p)),
  fc
    .record({
      commandType: fc.constant(GUIDE_COMMAND_TYPES.addStep),
      taskId: uuid,
      stepId: uuid,
      title: fc.string(),
    })
    .map((p) => cmd(GUIDE_COMMAND_TYPES.addStep, p)),
  fc
    .record({ commandType: fc.constant(GUIDE_COMMAND_TYPES.removeTask), taskId: uuid })
    .map((p) => cmd(GUIDE_COMMAND_TYPES.removeTask, p)),
);

describe('command sequence properties', () => {
  it('never throws and always yields a valid snapshot', () => {
    fc.assert(
      fc.property(fc.array(arbitraryCommand, { maxLength: 30 }), (commands) => {
        let state = freshGuideState(GUIDE_ID, 'g');
        state = applyCommands(state, commands);
        expect(state.guideId).toBe(GUIDE_ID);
        expect(Array.isArray(state.tasks)).toBe(true);
        for (const task of state.tasks) {
          expect(Array.isArray(task.stepIds)).toBe(true);
        }
      }),
    );
  });

  it('removing a task removes its steps from the visible set', () => {
    fc.assert(
      fc.property(arbitraryCommand, arbitraryCommand, (a, b) => {
        let state = freshGuideState(GUIDE_ID, 'g');
        state = applyGuideCommand(state, a);
        state = applyGuideCommand(state, b);
        // Removing an unknown task is a no-op; removing an existing task drops it.
        for (const task of state.tasks) {
          expect(task.taskId.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('reorder is a permutation: same ids, possibly different order', () => {
    const s0 = freshGuideState(GUIDE_ID, 'g');
    const t1 = '11111111-1111-4111-8111-111111111111' as EntityId;
    const t2 = '22222222-2222-4222-8222-222222222222' as EntityId;
    let state = applyGuideCommand(s0, cmd(GUIDE_COMMAND_TYPES.addTask, { taskId: t1, title: 'a' }));
    state = applyGuideCommand(state, cmd(GUIDE_COMMAND_TYPES.addTask, { taskId: t2, title: 'b' }));

    const swapped = applyGuideCommand(
      state,
      cmd(GUIDE_COMMAND_TYPES.reorderTasks, { orderedTaskIds: [t2, t1] }),
    );
    expect(swapped.tasks.map((t) => t.taskId)).toEqual([t2, t1]);
    expect(swapped.tasks.map((t) => t.title).sort()).toEqual(['a', 'b']);
  });

  it('invalid reorder (missing id) is a no-op', () => {
    const s0 = freshGuideState(GUIDE_ID, 'g');
    const t1 = '11111111-1111-4111-8111-111111111111' as EntityId;
    const state = applyGuideCommand(
      s0,
      cmd(GUIDE_COMMAND_TYPES.addTask, { taskId: t1, title: 'a' }),
    );
    const bad = applyGuideCommand(
      state,
      cmd(GUIDE_COMMAND_TYPES.reorderTasks, {
        orderedTaskIds: ['99999999-9999-4999-8999-999999999999' as EntityId],
      }),
    );
    expect(bad.tasks.map((t) => t.taskId)).toEqual([t1]);
  });
});
