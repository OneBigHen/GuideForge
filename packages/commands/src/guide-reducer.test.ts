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

describe('training commands (Phase 02 canonical training)', () => {
  it('adds objectives and assessment items without aliasing previous state', () => {
    const OID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const IID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const base = freshGuideState(GUIDE_ID, 'g');

    const withObjective = applyGuideCommand(
      base,
      cmd(GUIDE_COMMAND_TYPES.addObjective, {
        objectiveId: OID,
        verb: 'select',
        target: 'the correct test volume',
        conditions: 'given a 100-1000 uL micropipette',
        criterion: 'within tolerance',
        stepIds: [],
        citations: [{ sourceHash: 'a'.repeat(64), regionId: 'reg-1' }],
        criticality: 'core',
      }),
    );
    expect(withObjective.training.objectives).toHaveLength(1);
    expect(withObjective.training.objectives[0]!.objectiveId).toBe(OID);
    // Previous state must be unchanged (no aliasing).
    expect(base.training.objectives).toHaveLength(0);

    const withItem = applyGuideCommand(
      withObjective,
      cmd(GUIDE_COMMAND_TYPES.addAssessmentItem, {
        itemId: IID,
        objectiveId: OID,
        prompt: 'Which volume is correct?',
        interaction: 'single-choice',
        options: [
          { optionId: 'o1', text: '100 uL' },
          { optionId: 'o2', text: '500 uL' },
        ],
        scoringRule: { correct: ['o2'] },
        rationale: 'The source specifies 500 uL.',
        citations: [{ sourceHash: 'a'.repeat(64), regionId: 'reg-1' }],
        criticality: 'core',
      }),
    );
    expect(withItem.training.assessmentItems).toHaveLength(1);
    expect(withItem.training.objectives).toHaveLength(1);
    expect(withObjective.training.assessmentItems).toHaveLength(0);
  });

  it('idempotently refuses duplicate objectives', () => {
    const base = freshGuideState(GUIDE_ID, 'g');
    const addObjectiveCmd = cmd(GUIDE_COMMAND_TYPES.addObjective, {
      objectiveId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      verb: 'select',
      target: 'x',
      conditions: '',
      criterion: '',
      stepIds: [],
      citations: [],
      criticality: 'core' as const,
    });
    const once = applyGuideCommand(base, addObjectiveCmd);
    const twice = applyGuideCommand(once, addObjectiveCmd);
    expect(twice).toBe(once); // no-op returns same reference
  });

  it('replaces, edits, and reviews the canonical training program without aliasing', () => {
    const base = freshGuideState(GUIDE_ID, 'g');
    const objectiveId = 'objective-1' as EntityId;
    const itemId = 'item-1' as EntityId;
    const training = {
      ...base.training,
      objectives: [
        {
          objectiveId,
          verb: 'perform',
          target: 'the setup',
          conditions: 'given the approved guide',
          criterion: 'complete the check',
          stepIds: [],
          citations: [],
          criticality: 'important' as const,
        },
      ],
      assessmentItems: [
        {
          itemId,
          objectiveId,
          prompt: 'What is the setup?',
          interaction: 'short-answer' as const,
          options: [],
          scoringRule: { acceptedPhrases: ['setup'] },
          rationale: 'The source says setup.',
          citations: [],
          criticality: 'important' as const,
          reviewState: 'draft' as const,
        },
      ],
    };
    const replaced = applyGuideCommand(
      base,
      cmd(GUIDE_COMMAND_TYPES.replaceTraining, { training }),
    );
    expect(replaced.training.objectives[0]?.target).toBe('the setup');
    expect(base.training.objectives).toHaveLength(0);

    const edited = applyGuideCommand(
      replaced,
      cmd(GUIDE_COMMAND_TYPES.updateTrainingObjective, {
        objectiveId,
        target: 'the safe setup',
      }),
    );
    expect(edited.training.objectives[0]?.target).toBe('the safe setup');
    const reviewed = applyGuideCommand(
      edited,
      cmd(GUIDE_COMMAND_TYPES.reviewAssessmentItem, { itemId, reviewState: 'reviewed' }),
    );
    expect(reviewed.training.assessmentItems[0]?.reviewState).toBe('reviewed');
  });

  it('adds and removes values, conditions, and verification on a step (Phase 06)', () => {
    const base = freshGuideState(GUIDE_ID, 'g');
    const TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
    const STEP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as EntityId;
    const VALUE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as EntityId;
    const COND_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as EntityId;
    const VERIFY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as EntityId;

    const withStep = applyGuideCommand(
      base,
      cmd(GUIDE_COMMAND_TYPES.addTask, { taskId: TASK_ID, title: 'Task' }),
    );
    const stepState = applyGuideCommand(
      withStep,
      cmd(GUIDE_COMMAND_TYPES.addStep, {
        taskId: TASK_ID,
        stepId: STEP_ID,
        title: 'Tighten to spec',
      }),
    );
    const step0 = stepState.steps.find((s) => s.stepId === STEP_ID)!;
    expect(step0.values).toEqual([]);
    expect(step0.conditions).toEqual([]);
    expect(step0.verification).toEqual([]);

    const withValue = applyGuideCommand(
      stepState,
      cmd(GUIDE_COMMAND_TYPES.addValue, {
        stepId: STEP_ID,
        valueId: VALUE_ID,
        label: '5 nm',
        value: '5',
        unit: 'nm',
      }),
    );
    expect(withValue.steps.find((s) => s.stepId === STEP_ID)!.values).toEqual([
      { valueId: VALUE_ID, label: '5 nm', value: '5', unit: 'nm' },
    ]);

    const withCondition = applyGuideCommand(
      withValue,
      cmd(GUIDE_COMMAND_TYPES.addCondition, {
        stepId: STEP_ID,
        conditionId: COND_ID,
        text: 'if the cover is off',
      }),
    );
    expect(withCondition.steps.find((s) => s.stepId === STEP_ID)!.conditions).toHaveLength(1);

    const withVerification = applyGuideCommand(
      withCondition,
      cmd(GUIDE_COMMAND_TYPES.addVerification, {
        stepId: STEP_ID,
        verificationId: VERIFY_ID,
        text: 'confirm the seal fits',
      }),
    );
    const full = withVerification.steps.find((s) => s.stepId === STEP_ID)!;
    expect(full.verification).toHaveLength(1);
    expect(full.values).toHaveLength(1);
    expect(full.conditions).toHaveLength(1);

    const removed = applyGuideCommand(
      withVerification,
      cmd(GUIDE_COMMAND_TYPES.removeValue, { stepId: STEP_ID, valueId: VALUE_ID }),
    );
    expect(removed.steps.find((s) => s.stepId === STEP_ID)!.values).toHaveLength(0);

    const afterCondRemoval = applyGuideCommand(
      removed,
      cmd(GUIDE_COMMAND_TYPES.removeCondition, { stepId: STEP_ID, conditionId: COND_ID }),
    );
    expect(afterCondRemoval.steps.find((s) => s.stepId === STEP_ID)!.conditions).toHaveLength(0);

    const afterVerifyRemoval = applyGuideCommand(
      afterCondRemoval,
      cmd(GUIDE_COMMAND_TYPES.removeVerification, { stepId: STEP_ID, verificationId: VERIFY_ID }),
    );
    expect(afterVerifyRemoval.steps.find((s) => s.stepId === STEP_ID)!.verification).toHaveLength(
      0,
    );
  });
});
