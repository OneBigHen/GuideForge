import { materializeSnapshot } from '@guideforge/collaboration';
import type { EvidenceRecord } from '@guideforge/storage-web';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import {
  addEvidence,
  closeGuide,
  listEvidence,
  openGuide,
  type OpenGuideSession,
} from '../services/guideStore';

export const Route = createFileRoute('/run/$guideId')({
  component: RunPage,
});

function RunPage() {
  const { guideId } = Route.useParams();
  const [session, setSession] = useState<OpenGuideSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [note, setNote] = useState('');

  const refreshEvidence = useCallback(async () => {
    setEvidence(await listEvidence(guideId));
  }, [guideId]);

  useEffect(() => {
    let cancelled = false;
    let sessionRef: OpenGuideSession | null = null;
    void (async () => {
      try {
        const s = await openGuide(guideId);
        if (cancelled) {
          await closeGuide(s);
          return;
        }
        sessionRef = s;
        setSession(s);
        await refreshEvidence();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef) void closeGuide(sessionRef);
    };
  }, [guideId, refreshEvidence]);

  const snap = session ? materializeSnapshot(session.working) : null;
  const task = snap?.tasks[taskIndex];
  const stepId = task?.stepIds[stepIndex];
  const step = snap?.steps.find((s) => s.stepId === stepId) ?? null;

  async function capture(kind: 'photo' | 'note' | 'signature', value?: string) {
    if (!step) return;
    const v = kind === 'note' ? note.trim() : value;
    await addEvidence({
      guideId,
      stepId: step.stepId,
      kind,
      ...(v ? { value: v } : {}),
    });
    setNote('');
    await refreshEvidence();
  }

  const totalSteps = snap?.tasks.reduce((n, t) => n + t.stepIds.length, 0) ?? 0;
  const completedSteps = evidence.length;

  return (
    <section className="run-layout" aria-labelledby="run-title">
      <div className="run-header">
        <Link to="/library" className="button button--ghost button--small">
          ← Library
        </Link>
        <h1 id="run-title" className="run-header__title">
          {snap?.title ?? 'Running guide'}
        </h1>
        <div
          className="run-progress"
          aria-label={`${completedSteps} of ${totalSteps} steps completed`}
        >
          {completedSteps} / {totalSteps} evidence
        </div>
      </div>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      {step ? (
        <article className="step-card">
          <div className="step-card__context">
            Task {taskIndex + 1} of {snap!.tasks.length} · Step {stepIndex + 1} of{' '}
            {task!.stepIds.length}
          </div>
          <p className="step-card__instruction">{step.instructionText}</p>

          {step.warnings.length > 0 && (
            <ul className="warn-list">
              {step.warnings.map((w) => (
                <li key={w.warningId} className={`warn warn--${w.severity}`}>
                  {w.message}
                </li>
              ))}
            </ul>
          )}

          {step.tools.length > 0 && (
            <p className="step-card__tools">Tools: {step.tools.map((t) => t.name).join(', ')}</p>
          )}
          {step.parts.length > 0 && (
            <p className="step-card__parts">
              Parts: {step.parts.map((p) => `${p.name} × ${p.quantity}`).join(', ')}
            </p>
          )}

          <div className="evidence-block" aria-label="Evidence">
            <h2>Evidence</h2>
            <div className="evidence-actions">
              <button
                type="button"
                className="button"
                onClick={() => void capture('photo')}
                aria-label="Capture photo evidence (demo)"
              >
                📷 Photo
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void capture('signature')}
              >
                ✍️ Sign
              </button>
            </div>
            <div className="field-row">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && note.trim()) void capture('note');
                }}
              />
              <button
                type="button"
                className="button button--small"
                onClick={() => {
                  if (note.trim()) void capture('note');
                }}
              >
                Add note
              </button>
            </div>
            {evidence.length > 0 && (
              <ul className="evidence-list">
                {evidence.map((e) => (
                  <li key={e.evidenceId} className="evidence-list__item">
                    <span>
                      {e.kind}
                      {e.value ? `: ${e.value}` : ''}
                    </span>
                    <time dateTime={e.capturedAtIso}>
                      {new Date(e.capturedAtIso).toLocaleTimeString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="step-card__nav">
            <button
              type="button"
              className="button button--ghost"
              disabled={taskIndex === 0 && stepIndex === 0}
              onClick={() => {
                if (stepIndex > 0) setStepIndex((i) => i - 1);
                else if (taskIndex > 0) {
                  setTaskIndex((t) => t - 1);
                  const prev = snap!.tasks[taskIndex - 1];
                  setStepIndex(prev ? prev.stepIds.length - 1 : 0);
                }
              }}
            >
              ← Previous
            </button>
            <button
              type="button"
              className="button"
              disabled={
                taskIndex === snap!.tasks.length - 1 && stepIndex === task!.stepIds.length - 1
              }
              onClick={() => {
                if (stepIndex < task!.stepIds.length - 1) setStepIndex((i) => i + 1);
                else if (taskIndex < snap!.tasks.length - 1) {
                  setTaskIndex((t) => t + 1);
                  setStepIndex(0);
                }
              }}
            >
              Next →
            </button>
          </div>
        </article>
      ) : (
        <p className="empty-hint">
          {snap?.tasks.length === 0
            ? 'This guide has no tasks yet. Add them in the editor.'
            : 'Select a step to begin.'}
        </p>
      )}
    </section>
  );
}
