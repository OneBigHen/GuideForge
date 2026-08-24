import { materializeSnapshot } from '@guideforge/collaboration';
import {
  exportQti3,
  exportXapiJson,
  type TrainingAttemptResult,
  type TrainingSession,
} from '@guideforge/guide-schema';
import { createFileRoute, Link } from '@tanstack/react-router';
import { strToU8, zipSync } from 'fflate';
import { useEffect, useState } from 'react';
import {
  closeGuide,
  loadTrainingSession,
  openGuide,
  recordTrainingAnswer,
  startOfflineTrainingRetest,
  submitOfflineTrainingAttempt,
  type OpenGuideSession,
} from '../services/guideStore';

export const Route = createFileRoute('/training/player/$guideId')({
  component: TrainingPlayerPage,
});

function download(name: string, bytes: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function TrainingPlayerPage() {
  const { guideId } = Route.useParams();
  const [guideSession, setGuideSession] = useState<OpenGuideSession | null>(null);
  const [runtime, setRuntime] = useState<TrainingSession | null>(null);
  const [attemptResult, setAttemptResult] = useState<TrainingAttemptResult | null>(null);
  const [selected, setSelected] = useState('');
  const [snapshotTitle, setSnapshotTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let sessionRef: OpenGuideSession | null = null;
    void (async () => {
      try {
        const nextGuideSession = await openGuide(guideId);
        if (cancelled) {
          await closeGuide(nextGuideSession);
          return;
        }
        sessionRef = nextGuideSession;
        const snapshot = materializeSnapshot(nextGuideSession.working);
        const nextRuntime = await loadTrainingSession(nextGuideSession);
        setGuideSession(nextGuideSession);
        setSnapshotTitle(snapshot.title);
        setRuntime(nextRuntime);
        const currentId = nextRuntime.itemIds[nextRuntime.currentItemIndex];
        const currentResponse = currentId ? nextRuntime.responses[currentId] : undefined;
        setSelected(typeof currentResponse === 'string' ? currentResponse : '');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef) void closeGuide(sessionRef);
    };
  }, [guideId]);

  const snapshot = guideSession ? materializeSnapshot(guideSession.working) : null;
  const training = snapshot?.training;
  const currentItemId = runtime
    ? runtime.itemIds[Math.min(runtime.currentItemIndex, Math.max(0, runtime.itemIds.length - 1))]
    : undefined;
  const currentItem = training?.assessmentItems.find((item) => item.itemId === currentItemId);
  const allAnswered =
    runtime?.itemIds.every((itemId) => runtime.responses[itemId] !== undefined) ?? false;

  async function answer(): Promise<void> {
    if (!guideSession || !runtime || !currentItem || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const next = await recordTrainingAnswer(guideSession, runtime, currentItem.itemId, selected);
      setRuntime(next);
      setSelected('');
      setNotice('Answer saved locally. You can continue offline.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (!guideSession || !runtime || !allAnswered) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitOfflineTrainingAttempt(guideSession, runtime);
      setRuntime(result.session);
      setAttemptResult(result);
      setSelected('');
      setNotice(
        result.attempt.passed
          ? 'Mastery achieved.'
          : 'Attempt scored; follow remediation before retesting.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function retest(): Promise<void> {
    if (!guideSession || !runtime) return;
    setBusy(true);
    setError(null);
    try {
      setRuntime(await startOfflineTrainingRetest(guideSession, runtime));
      setAttemptResult(null);
      setSelected('');
      setNotice('Retest started. Your previous attempt remains in the local record.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function exportQti(): void {
    if (!training) return;
    const result = exportQti3(training);
    const archive = zipSync(
      Object.fromEntries(
        Object.entries(result.files).map(([path, content]) => [path, strToU8(content)]),
      ),
      { level: 0 },
    );
    download('guideforge-training-qti3.zip', archive, 'application/zip');
    setNotice(
      `${result.compatibility.supportedItemIds.length} QTI item(s) exported; ${result.compatibility.unsupportedItemIds.length} skipped.`,
    );
  }

  function exportXapi(): void {
    if (!runtime) return;
    download('guideforge-training-xapi.json', exportXapiJson(runtime), 'application/json');
    setNotice('xAPI-aligned statements exported from the local attempt log.');
  }

  return (
    <section className="training-player" aria-labelledby="training-player-title">
      <header className="training-player__header">
        <div>
          <Link
            to="/training/$guideId"
            params={{ guideId }}
            className="button button--ghost button--small"
          >
            ← Training studio
          </Link>
          <h1 id="training-player-title">Training player</h1>
          <p className="empty-hint">{snapshotTitle || 'Loading guide…'} · offline-first</p>
        </div>
        <div className="training-player__exports">
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={exportXapi}
            disabled={!runtime}
          >
            Export xAPI
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={exportQti}
            disabled={!training}
          >
            Export QTI 3
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="release-note">
          {notice}
        </p>
      )}

      {runtime && training ? (
        <>
          <section
            className={`training-player__status training-player__status--${runtime.status}`}
            aria-label="Training status"
          >
            <strong>
              {runtime.status === 'mastered' ? 'Mastered' : runtime.status.replace('-', ' ')}
            </strong>
            <span>
              {runtime.attempts.length} attempt{runtime.attempts.length === 1 ? '' : 's'}
            </span>
            <span>
              {runtime.itemIds.length} item{runtime.itemIds.length === 1 ? '' : 's'}
            </span>
          </section>

          {currentItem && runtime.status === 'in-progress' && (
            <article className="training-player__card">
              <div className="training-player__progress">
                Item {Math.min(runtime.currentItemIndex + 1, runtime.itemIds.length)} of{' '}
                {runtime.itemIds.length}
              </div>
              <h2>{currentItem.prompt}</h2>
              <fieldset className="training-choice-list">
                <legend className="visually-hidden">Choose an answer</legend>
                {currentItem.options.map((option) => (
                  <label className="training-choice" key={option.optionId}>
                    <input
                      type="radio"
                      name={`item-${currentItem.itemId}`}
                      value={option.optionId}
                      checked={selected === option.optionId}
                      onChange={(event) => setSelected(event.currentTarget.value)}
                    />
                    <span>{option.text}</span>
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                className="button"
                onClick={() => void answer()}
                disabled={busy || !selected}
              >
                {busy ? 'Saving…' : 'Save answer'}
              </button>
              {allAnswered && (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void submit()}
                  disabled={busy}
                >
                  Submit assessment
                </button>
              )}
            </article>
          )}

          {attemptResult && (
            <section className="training-player__result" aria-label="Assessment result">
              <h2>
                {attemptResult.attempt.passed ? 'Mastery achieved' : 'More practice required'}
              </h2>
              <p>
                Score {Math.round(attemptResult.attempt.score * 100)}% · objective outcomes{' '}
                {attemptResult.attempt.objectiveOutcomes.filter((outcome) => outcome.passed).length}
                /{attemptResult.attempt.objectiveOutcomes.length} passed
              </p>
              {attemptResult.attempt.remediationActivityIds.length > 0 && (
                <p>
                  Remediation activities: {attemptResult.attempt.remediationActivityIds.join(', ')}
                </p>
              )}
              {runtime.status !== 'mastered' && (
                <button
                  type="button"
                  className="button"
                  onClick={() => void retest()}
                  disabled={busy}
                >
                  Start retest
                </button>
              )}
            </section>
          )}

          {runtime.status === 'mastered' && !attemptResult && (
            <p className="release-note">This learner has already mastered the program.</p>
          )}
          {runtime.attempts.length > 0 && (
            <section className="training-player__history" aria-label="Attempt history">
              <h2>Attempt history</h2>
              <ol>
                {runtime.attempts.map((attempt) => (
                  <li key={attempt.attemptId}>
                    Attempt {attempt.attemptNumber}: {Math.round(attempt.score * 100)}% ·{' '}
                    {attempt.status}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="training-player__cmi5">
            cmi5: launch metadata seam only; no LMS/LRS network call is made by this offline player.
          </p>
        </>
      ) : (
        <p className="empty-hint" role="status">
          Loading training…
        </p>
      )}
    </section>
  );
}
