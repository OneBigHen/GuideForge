import { generateProceduralGlb } from '@guideforge/assets';
import { materializeSnapshot } from '@guideforge/collaboration';
import { applyCommands, freshGuideState } from '@guideforge/commands';
import { sha256Hex } from '@guideforge/domain';
import {
  answerTrainingItem,
  beginRuntimeStep,
  completeRuntimeStep,
  createRuntimeCompletionRule,
  createRuntimeSession,
  isGuideSnapshot,
  recordRuntimeEvidence,
  runtimeProgress,
  startTrainingSession,
  submitTrainingAttempt,
} from '@guideforge/guide-schema';
import { canonicalJson } from '@guideforge/package-gforge';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeGuide,
  dispatchCommand,
  getGuideMeta,
  listGuides,
  openGuide,
} from '../services/guideStore';
import {
  DEMO_GUIDE_ID,
  DEMO_GUIDE_TITLE,
  DEMO_GUIDE_VERSION,
  DEMO_PROFILE_MARKDOWN,
  buildDemoCommands,
  buildPristineDemoSnapshot,
  ensureDemoGuide,
  resetDemoGuide,
} from './get-to-know-andrew';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const SOURCE_HASH = sha256Hex(new TextEncoder().encode(DEMO_PROFILE_MARKDOWN));

function commands(): ReturnType<typeof buildDemoCommands> {
  // Pure-model resolver hands out stable fake region ids so citation-bearing
  // commands can be exercised without the ingestion pipeline.
  let fakeRegionSeq = 0;
  return buildDemoCommands(SOURCE_HASH as never, () => {
    fakeRegionSeq += 1;
    return `heading:${fakeRegionSeq}`;
  });
}

describe('demo fixture (pure command model)', () => {
  it('validates against the current guide schema', () => {
    const snapshot = applyCommands(freshGuideState(DEMO_GUIDE_ID, ''), commands());
    expect(isGuideSnapshot(snapshot)).toBe(true);
  });

  it('covers the required demo primitives', () => {
    const snapshot = applyCommands(freshGuideState(DEMO_GUIDE_ID, ''), commands());
    expect(snapshot.title).toBe(DEMO_GUIDE_TITLE);
    expect(snapshot.tasks).toHaveLength(3);
    for (const task of snapshot.tasks) {
      expect(task.stepIds.length).toBeGreaterThanOrEqual(2);
      expect(task.stepIds.length).toBeLessThanOrEqual(4);
    }
    // warning + tool + verification + media attached to real steps.
    const steps = snapshot.steps;
    expect(steps.some((s) => s.warnings.length > 0)).toBe(true);
    expect(steps.some((s) => s.tools.length > 0)).toBe(true);
    expect(steps.some((s) => s.verification.length > 0)).toBe(true);
    const media = steps.flatMap((s) => s.media);
    expect(media).toHaveLength(2);
    expect(media.every((m) => m.kind === 'model' && /^[0-9a-f]{64}$/.test(m.assetHash))).toBe(true);
    // Media hashes must match the deterministic procedural assets.
    const workbenchHash = sha256Hex(generateProceduralGlb('workbench'));
    expect(media.map((m) => m.assetHash)).toContain(workbenchHash);
    // Training: one objective, three cited assessment items, blueprint threshold.
    expect(snapshot.training.objectives).toHaveLength(1);
    expect(snapshot.training.assessmentItems).toHaveLength(3);
    expect(snapshot.training.assessmentItems.every((i) => i.citations.length > 0)).toBe(true);
    expect(snapshot.training.assessmentBlueprint?.passThreshold).toBeGreaterThan(0);
    expect(snapshot.training.mastery.requiredCriticalItems).toBeGreaterThan(0);
  });

  it('is deterministic — same commands always yield the same snapshot', () => {
    const a = applyCommands(freshGuideState(DEMO_GUIDE_ID, ''), commands());
    const b = applyCommands(freshGuideState(DEMO_GUIDE_ID, ''), commands());
    expect(canonicalJson(a)).toEqual(canonicalJson(b));
  });

  it('completes the procedure runtime end-to-end (pure)', () => {
    const snapshot = applyCommands(freshGuideState(DEMO_GUIDE_ID, ''), commands());
    const stepIds = snapshot.tasks.flatMap((t) => t.stepIds);
    let runtime = createRuntimeSession({
      sessionId: 'session-demo',
      guideId: DEMO_GUIDE_ID,
      learnerId: 'visitor',
      stepIds,
      nowIso: '2026-01-01T00:00:00.000Z',
    });
    for (const stepId of stepIds) {
      const step = snapshot.steps.find((candidate) => candidate.stepId === stepId)!;
      const verificationIds = step.verification.map((v) => v.verificationId);
      const active = beginRuntimeStep(
        runtime,
        stepId,
        `attempt-${stepId}`,
        '2026-01-01T00:01:00.000Z',
        verificationIds,
      );
      // One note evidence per verification check (or one for an unchecked
      // step) — mirrors what the run UI requires before completion.
      const evidence = verificationIds.map((verificationId, index) => ({
        evidenceId: `ev-${stepId}-${index}`,
        kind: 'note' as const,
      }));
      let withEvidence = active;
      for (let index = 0; index < evidence.length; index += 1) {
        withEvidence = recordRuntimeEvidence(
          withEvidence,
          stepId,
          evidence[index]!.evidenceId,
          '2026-01-01T00:01:30.000Z',
          verificationIds[index],
        );
      }
      if (evidence.length === 0) {
        withEvidence = recordRuntimeEvidence(
          withEvidence,
          stepId,
          `ev-${stepId}-0`,
          '2026-01-01T00:01:30.000Z',
        );
        evidence.push({ evidenceId: `ev-${stepId}-0`, kind: 'note' });
      }
      runtime = completeRuntimeStep({
        session: withEvidence,
        stepId,
        completionId: `completion-${stepId}`,
        completedBy: 'visitor',
        evidence,
        rule: createRuntimeCompletionRule(verificationIds),
        nowIso: '2026-01-01T00:02:00.000Z',
      });
    }
    expect(runtime.status).toBe('completed');
    expect(runtimeProgress(runtime).completedSteps).toBe(stepIds.length);
  });

  it('passes training when all items are answered correctly (pure)', () => {
    const snapshot = buildPristineDemoSnapshot(SOURCE_HASH as never);
    const session = startTrainingSession(
      snapshot.training,
      DEMO_GUIDE_ID,
      'visitor',
      '2026-01-01T00:00:00.000Z',
    );
    expect(session.itemIds).toHaveLength(3);
    let next = session;
    for (const itemId of session.itemIds) {
      const item = snapshot.training.assessmentItems.find(
        (candidate) => candidate.itemId === itemId,
      )!;
      const correctId = (item.scoringRule as { correctOptionIds: string[] }).correctOptionIds[0]!;
      next = answerTrainingItem(next, itemId, correctId, '2026-01-01T00:03:00.000Z');
    }
    const result = submitTrainingAttempt(snapshot.training, next, '2026-01-01T00:04:00.000Z');
    expect(result.attempt.passed).toBe(true);
    expect(result.session.status).toBe('mastered');
  });
});

describe('ensureDemoGuide (browser-local persistence)', () => {
  beforeEach(async () => {
    await Dexie.delete('guideforge');
    // y-indexeddb stores docs in per-name databases named after the doc.
    await Dexie.delete(DEMO_GUIDE_ID);
  });

  it('creates the guide once and is idempotent on repeat runs', async () => {
    const first = await ensureDemoGuide();
    expect(first.created).toBe(true);
    expect(first.guideId).toBe(DEMO_GUIDE_ID);
    expect(first.version).toBe(DEMO_GUIDE_VERSION);

    const meta = await getGuideMeta(DEMO_GUIDE_ID);
    expect(meta?.title).toBe(DEMO_GUIDE_TITLE);

    const second = await ensureDemoGuide();
    expect(second.created).toBe(false);
    const all = await listGuides();
    expect(all.filter((entry) => entry.guideId === DEMO_GUIDE_ID)).toHaveLength(1);
  }, 30_000);

  it('never overwrites a visitor-modified local copy without an explicit reset', async () => {
    await ensureDemoGuide();
    const session = await openGuide(DEMO_GUIDE_ID);
    try {
      await dispatchCommand(session, {
        commandId: crypto.randomUUID(),
        commandType: 'guide/set-title',
        actorId: 'local-user',
        guideId: DEMO_GUIDE_ID,
        origin: 'user',
        occurredAt: new Date().toISOString(),
        payload: { title: 'My modified demo' },
      });
    } finally {
      await closeGuide(session);
    }
    const again = await ensureDemoGuide();
    expect(again.created).toBe(false);
    const reopened = await openGuide(DEMO_GUIDE_ID);
    try {
      expect(materializeSnapshot(reopened.working).title).toBe('My modified demo');
    } finally {
      await closeGuide(reopened);
    }
  }, 30_000);

  it('reset recreates the pristine demo', async () => {
    await ensureDemoGuide();
    const sessionA = await openGuide(DEMO_GUIDE_ID);
    try {
      await dispatchCommand(sessionA, {
        commandId: crypto.randomUUID(),
        commandType: 'guide/set-title',
        actorId: 'local-user',
        guideId: DEMO_GUIDE_ID,
        origin: 'user',
        occurredAt: new Date().toISOString(),
        payload: { title: 'Mutated' },
      });
    } finally {
      await closeGuide(sessionA);
    }

    const reset = await resetDemoGuide();
    expect(reset.created).toBe(true);
    const sessionB = await openGuide(DEMO_GUIDE_ID);
    try {
      const snap = materializeSnapshot(sessionB.working);
      expect(snap.title).toBe(DEMO_GUIDE_TITLE);
      expect(snap.tasks).toHaveLength(3);
      expect(snap.sources).toHaveLength(1);
      expect(snap.steps.flatMap((s) => s.media)).toHaveLength(2);
    } finally {
      await closeGuide(sessionB);
    }
  }, 45_000);
});
