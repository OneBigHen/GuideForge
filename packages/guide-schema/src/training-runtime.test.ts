import { describe, expect, it } from 'vitest';
import {
  answerTrainingItem,
  beginTrainingRetest,
  exportQti3,
  exportXapiJson,
  generateTrainingFromProcedure,
  importQti3,
  startTrainingSession,
  submitTrainingAttempt,
  trainingEvents,
  type GuideSnapshot,
} from './index.js';

function program(): ReturnType<typeof generateTrainingFromProcedure> {
  const sourceHash = 'a'.repeat(64);
  return generateTrainingFromProcedure({
    guideId: 'guide-runtime',
    title: 'Runtime guide',
    tasks: [{ taskId: 'task-runtime', title: 'Setup', stepIds: ['step-runtime'] }],
    steps: [
      {
        stepId: 'step-runtime',
        taskId: 'task-runtime',
        instructionText: 'Disconnect power before opening the housing.',
        warnings: [],
        claimIds: [],
      },
    ],
    sources: [
      {
        sourceHash,
        regions: [
          {
            regionId: 'region-runtime',
            sourceHash,
            text: 'Disconnect power before opening the housing.',
          },
        ],
      },
    ],
    citations: [],
  } as unknown as GuideSnapshot);
}

describe('training runtime', () => {
  it('fails, records remediation, retests, and reaches deterministic mastery offline', () => {
    const generated = program();
    const item = generated.training.assessmentItems[0]!;
    const correctOptionIds = item.scoringRule.correctOptionIds as string[];
    const wrong =
      item.options.find((option) => !correctOptionIds.includes(option.optionId))?.optionId ?? '';
    const right =
      item.options.find((option) => option.optionId === correctOptionIds[0])?.optionId ?? '';
    const first = startTrainingSession(
      generated.training,
      'guide-runtime',
      'learner-1',
      '2026-08-11T00:00:00.000Z',
    );
    const failed = submitTrainingAttempt(
      generated.training,
      answerTrainingItem(first, item.itemId, wrong, '2026-08-11T00:01:00.000Z'),
      '2026-08-11T00:02:00.000Z',
    );
    expect(failed.attempt.status).toBe('remediation');
    expect(failed.attempt.passed).toBe(false);
    expect(failed.attempt.remediationActivityIds).toHaveLength(1);
    const retest = beginTrainingRetest(
      generated.training,
      failed.session,
      '2026-08-11T00:03:00.000Z',
    );
    const mastered = submitTrainingAttempt(
      generated.training,
      answerTrainingItem(retest, item.itemId, right, '2026-08-11T00:04:00.000Z'),
      '2026-08-11T00:05:00.000Z',
    );
    expect(mastered.session.status).toBe('mastered');
    expect(mastered.attempt.score).toBe(1);
    expect(mastered.attempt.objectiveOutcomes[0]?.passed).toBe(true);
  });

  it('exports xAPI-aligned statements and event records from the same attempt log', () => {
    const generated = program();
    const item = generated.training.assessmentItems[0]!;
    const correct = item.scoringRule.correctOptionIds as string[];
    const session = submitTrainingAttempt(
      generated.training,
      answerTrainingItem(
        startTrainingSession(
          generated.training,
          'guide-runtime',
          'learner-2',
          '2026-08-11T01:00:00.000Z',
        ),
        item.itemId,
        correct[0]!,
        '2026-08-11T01:01:00.000Z',
      ),
      '2026-08-11T01:02:00.000Z',
    ).session;
    const events = trainingEvents(session);
    expect(events.some((event) => event.type === 'mastered')).toBe(true);
    const statements = JSON.parse(exportXapiJson(session)) as { verb: { id: string } }[];
    expect(statements.some((statement) => statement.verb.id.endsWith('/passed'))).toBe(true);
    expect(statements.some((statement) => statement.verb.id.endsWith('/completed'))).toBe(true);
  });
});

describe('QTI 3 adapter', () => {
  it('exports a QTI package subset and imports it with an explicit compatibility warning', () => {
    const generated = program();
    const exported = exportQti3(generated.training);
    expect(exported.files['imsmanifest.xml']).toContain('imsqti_item_xmlv3p0');
    expect(exported.compatibility.supportedItemIds).toHaveLength(1);
    const imported = importQti3(exported.files);
    expect(imported.training.assessmentItems).toHaveLength(1);
    expect(
      imported.compatibility.warnings.some((warning) => warning.includes('source citations')),
    ).toBe(true);
  });

  it('rejects active XML constructs before parsing', () => {
    expect(() => importQti3('<!DOCTYPE foo><qti-assessment-item />')).toThrow(/forbidden/);
  });
});
