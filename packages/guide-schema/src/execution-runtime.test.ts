import { describe, expect, it } from 'vitest';
import {
  beginRuntimeStep,
  buildRuntimeCompletionReport,
  completeRuntimeStep,
  createRuntimeCompletionRule,
  createRuntimeSession,
  recordRuntimeEvidence,
  runtimeProgress,
} from './execution-runtime';

describe('offline procedure execution runtime', () => {
  it('requires evidence and explicit completion, then advances from completion state', () => {
    const start = createRuntimeSession({
      sessionId: 'session-1',
      guideId: 'guide-1',
      learnerId: 'local-user',
      stepIds: ['step-1', 'step-2'],
      nowIso: '2026-08-11T00:00:00.000Z',
    });
    const attempted = beginRuntimeStep(start, 'step-1', 'attempt-1', '2026-08-11T00:01:00.000Z');
    expect(() =>
      completeRuntimeStep({
        session: attempted,
        stepId: 'step-1',
        completionId: 'completion-1',
        completedBy: 'local-user',
        evidence: [],
        rule: createRuntimeCompletionRule(1),
        nowIso: '2026-08-11T00:02:00.000Z',
      }),
    ).toThrow('capture at least one evidence item');

    const withEvidence = recordRuntimeEvidence(
      attempted,
      'step-1',
      'evidence-1',
      '2026-08-11T00:03:00.000Z',
    );
    const completed = completeRuntimeStep({
      session: withEvidence,
      stepId: 'step-1',
      completionId: 'completion-1',
      completedBy: 'local-user',
      evidence: [{ evidenceId: 'evidence-1', kind: 'photo' }],
      rule: createRuntimeCompletionRule(1),
      nowIso: '2026-08-11T00:04:00.000Z',
    });
    expect(runtimeProgress(completed)).toMatchObject({
      completedSteps: 1,
      totalSteps: 2,
      currentStepId: 'step-2',
    });
    expect(completed.completions[0]?.evidenceIds).toEqual(['evidence-1']);
  });

  it('builds a report from completions and preserves evidence provenance', () => {
    const session = createRuntimeSession({
      sessionId: 'session-2',
      guideId: 'guide-2',
      learnerId: 'local-user',
      stepIds: ['step-1'],
      nowIso: '2026-08-11T00:00:00.000Z',
    });
    const active = recordRuntimeEvidence(
      beginRuntimeStep(session, 'step-1', 'attempt-1', '2026-08-11T00:01:00.000Z'),
      'step-1',
      'evidence-1',
      '2026-08-11T00:02:00.000Z',
    );
    const completed = completeRuntimeStep({
      session: active,
      stepId: 'step-1',
      completionId: 'completion-1',
      completedBy: 'local-user',
      evidence: [{ evidenceId: 'evidence-1', kind: 'signature' }],
      rule: createRuntimeCompletionRule(),
      nowIso: '2026-08-11T00:03:00.000Z',
    });
    const report = buildRuntimeCompletionReport({
      session: completed,
      stepTitles: { 'step-1': 'Verify seal' },
      evidence: [
        {
          evidenceId: 'evidence-1',
          stepId: 'step-1',
          kind: 'signature',
          capturedAtIso: '2026-08-11T00:02:00.000Z',
          assetHash: 'a'.repeat(64),
        },
      ],
      exportedAtIso: '2026-08-11T00:04:00.000Z',
    });
    expect(report).toMatchObject({ status: 'completed', completedSteps: 1 });
    expect(report.steps[0]).toMatchObject({ title: 'Verify seal', completed: true });
    expect(report.evidence[0]?.assetHash).toBe('a'.repeat(64));
  });
});
