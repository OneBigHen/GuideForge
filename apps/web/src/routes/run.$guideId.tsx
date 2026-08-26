import { materializeSnapshot } from '@guideforge/collaboration';
import { runtimeProgress, type RuntimeSession } from '@guideforge/guide-schema';
import type { EvidenceRecord } from '@guideforge/storage-web';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  captureRuntimePhoto,
  closeGuide,
  completeRuntimeStepForGuide,
  createRuntimeAttestation,
  exportRuntimeCompletionReport,
  listEvidence,
  loadRuntimeSession,
  openGuide,
  recordRuntimeMeasurement,
  recordRuntimeNote,
  type OpenGuideSession,
} from '../services/guideStore';

export const Route = createFileRoute('/run/$guideId')({
  component: RunPage,
});

function RunPage() {
  const { guideId } = Route.useParams();
  const [session, setSession] = useState<OpenGuideSession | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSession | null>(null);
  const [supersededSession, setSupersededSession] = useState<RuntimeSession | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [measurementLabel, setMeasurementLabel] = useState('');
  const [measurementValue, setMeasurementValue] = useState('');
  const [measurementUnit, setMeasurementUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [reportExported, setReportExported] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    let sessionRef: OpenGuideSession | null = null;
    void (async () => {
      try {
        const nextSession = await openGuide(guideId);
        if (cancelled) {
          await closeGuide(nextSession);
          return;
        }
        sessionRef = nextSession;
        setSession(nextSession);
        const loaded = await loadRuntimeSession(nextSession);
        setRuntime(loaded.runtime);
        setSupersededSession(loaded.supersededSession);
        setEvidence(await listEvidence(guideId));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef) void closeGuide(sessionRef);
    };
  }, [guideId]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const snapshot = session ? materializeSnapshot(session.working) : null;
  const steps = useMemo(
    () =>
      snapshot?.tasks.flatMap((task) =>
        task.stepIds
          .map((stepId) => snapshot.steps.find((step) => step.stepId === stepId))
          .filter((step): step is NonNullable<typeof step> => step !== undefined),
      ) ?? [],
    [snapshot],
  );
  const progress = runtime
    ? runtimeProgress(runtime)
    : { completedSteps: 0, totalSteps: steps.length, currentStepId: null };
  const step = steps.find((candidate) => candidate.stepId === progress.currentStepId) ?? null;
  const activeAttempt = step
    ? runtime?.attempts.find(
        (attempt) => attempt.stepId === step.stepId && attempt.status === 'in-progress',
      )
    : undefined;
  const activeEvidenceIds = new Set(activeAttempt?.evidenceIds ?? []);
  const stepEvidence = step
    ? evidence.filter(
        (record) => record.stepId === step.stepId && activeEvidenceIds.has(record.evidenceId),
      )
    : [];
  const task = step ? snapshot?.tasks.find((candidate) => candidate.taskId === step.taskId) : null;
  const taskIndex = task && snapshot ? snapshot.tasks.indexOf(task) : -1;
  const stepIndex = task && step ? task.stepIds.indexOf(step.stepId) : -1;
  const stepState = step ? snapshot?.scene.stepStates[step.stepId] : undefined;
  const camera = stepState?.cameraId
    ? snapshot?.scene.cameras.find((candidate) => candidate.cameraId === stepState.cameraId)
    : undefined;
  const stepAnnotations = stepState
    ? (snapshot?.scene.annotations.filter((annotation) =>
        stepState.visibleNodeIds.includes(annotation.targetNodeId),
      ) ?? [])
    : [];
  const visibleSceneNodes = stepState
    ? (snapshot?.scene.nodes.filter((node) => stepState.visibleNodeIds.includes(node.nodeId)) ?? [])
    : [];
  const verificationChecks = step?.verification ?? [];
  const satisfiedVerificationIds = new Set(
    activeAttempt?.verificationEvidence
      .filter((item) => item.evidenceIds.length > 0)
      .map((item) => item.verificationId) ?? [],
  );
  const minimumEvidenceCount = Math.max(1, verificationChecks.length);
  const canComplete =
    stepEvidence.length >= minimumEvidenceCount &&
    verificationChecks.every((check) => satisfiedVerificationIds.has(check.verificationId));

  async function refreshEvidence() {
    setEvidence(await listEvidence(guideId));
  }

  async function runAction(action: () => Promise<RuntimeSession | void>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setRuntime(next);
      await refreshEvidence();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(file: File) {
    if (!session || !runtime || !step) return;
    await runAction(async () => {
      const result = await captureRuntimePhoto(session, runtime, step.stepId, file);
      return result.runtime;
    });
  }

  function downloadReport(bytes: Uint8Array, filename: string) {
    const url = URL.createObjectURL(
      new Blob([bytes as unknown as BlobPart], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setReportExported(true);
  }

  async function handleExportReport() {
    if (!session || !runtime) return;
    setBusy(true);
    setError(null);
    try {
      const report = await exportRuntimeCompletionReport(session, runtime);
      downloadReport(report.bytes, report.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const showCompletion = runtime?.status === 'completed';

  return (
    <section className="run-layout" aria-labelledby="run-title">
      <div className="run-header">
        <Link to="/library" className="button button--ghost button--small">
          ← Library
        </Link>
        <h1 id="run-title" className="run-header__title">
          {snapshot?.title ?? 'Running guide'}
        </h1>
        <div
          className="run-progress"
          aria-label={`${progress.completedSteps} of ${progress.totalSteps} steps completed`}
        >
          {progress.completedSteps} / {progress.totalSteps} steps completed
        </div>
      </div>

      <p className="status-row" role="status">
        <span className={`status-pill ${online ? '' : 'status-dot--offline'}`}>
          {online ? 'Online' : 'Offline'} · changes save on this device
        </span>
      </p>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      {supersededSession && (
        <p role="status" className="health-banner">
          This guide changed since your last run, so a new run session started. Your previous run
          (started {new Date(supersededSession.createdAtIso).toLocaleString()},{' '}
          {supersededSession.completions.length} of {supersededSession.stepIds.length} steps
          completed) is still saved under session {supersededSession.sessionId.slice(0, 8)} — it is
          no longer shown here.{' '}
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setSupersededSession(null)}
          >
            Dismiss
          </button>
        </p>
      )}

      {showCompletion && runtime ? (
        <article className="step-card" aria-labelledby="completion-title">
          <h2 id="completion-title">Procedure complete</h2>
          <p>
            {progress.completedSteps} of {progress.totalSteps} steps have explicit completions and
            captured evidence.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => void handleExportReport()}
            disabled={busy}
          >
            {busy ? 'Preparing report…' : 'Export completion report'}
          </button>
          {reportExported && (
            <p role="status">Completion report exported with evidence hashes and attestations.</p>
          )}
        </article>
      ) : step && runtime ? (
        <article className="step-card">
          <div className="step-card__context">
            Task {taskIndex + 1} of {snapshot?.tasks.length ?? 0} · Step {stepIndex + 1} of{' '}
            {task?.stepIds.length ?? 0}
          </div>
          <p className="step-card__instruction">{step.instructionText}</p>

          {step.warnings.length > 0 && (
            <ul className="warn-list">
              {step.warnings.map((warning) => (
                <li key={warning.warningId} className={`warn warn--${warning.severity}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          )}

          {step.tools.length > 0 && (
            <p className="step-card__tools">
              Tools: {step.tools.map((tool) => tool.name).join(', ')}
            </p>
          )}
          {step.parts.length > 0 && (
            <p className="step-card__parts">
              Parts: {step.parts.map((part) => `${part.name} × ${part.quantity}`).join(', ')}
            </p>
          )}

          <section className="runtime-scene" aria-label="Step scene">
            <h2>Step scene</h2>
            <p>
              {stepState?.visibleNodeIds.length ?? 0} scene item(s) visible ·{' '}
              {stepAnnotations.length} annotation(s)
              {camera ? ` · Camera: ${camera.name}` : ' · No camera assigned'}
            </p>
            {visibleSceneNodes.length > 0 && (
              <ul className="scene-spatial-tree" aria-label="Visible scene items">
                {visibleSceneNodes.map((node) => (
                  <li key={node.nodeId}>
                    <strong>{node.name}</strong>
                    <span>
                      Position: {node.transform.position.x.toFixed(2)},{' '}
                      {node.transform.position.y.toFixed(2)}, {node.transform.position.z.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {camera && (
              <p>
                Camera position: {camera.position.x.toFixed(2)}, {camera.position.y.toFixed(2)},{' '}
                {camera.position.z.toFixed(2)} · target: {camera.target.x.toFixed(2)},{' '}
                {camera.target.y.toFixed(2)}, {camera.target.z.toFixed(2)}
              </p>
            )}
            {stepAnnotations.length > 0 && (
              <ul className="scene-spatial-tree" aria-label="Step annotations">
                {stepAnnotations.map((annotation) => (
                  <li key={annotation.annotationId}>
                    <strong>{annotation.text}</strong>
                    <span>
                      Anchor:{' '}
                      {annotation.targetPoint
                        ? `${annotation.targetPoint.x.toFixed(2)}, ${annotation.targetPoint.y.toFixed(2)}, ${annotation.targetPoint.z.toFixed(2)}`
                        : 'node-local'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {verificationChecks.length > 0 && (
            <section className="runtime-verification" aria-labelledby="verification-title">
              <h2 id="verification-title">Verification checks</h2>
              <ul>
                {verificationChecks.map((check) => (
                  <li key={check.verificationId}>{check.text}</li>
                ))}
              </ul>
              <p>
                {satisfiedVerificationIds.size} of {verificationChecks.length} checks have evidence.
                Capture at least one evidence item for each check before using the explicit
                completion action.
              </p>
            </section>
          )}

          <div className="evidence-block" aria-label="Evidence">
            <h2>Evidence</h2>
            <div className="evidence-actions">
              <button
                type="button"
                className="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={busy}
                aria-label="Capture photo evidence"
              >
                📷 Capture photo
              </button>
              <input
                ref={photoInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                aria-label="Procedure photo input"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void handlePhoto(file);
                }}
              />
              <button
                type="button"
                className="button button--ghost"
                onClick={() =>
                  void runAction(async () => {
                    const result = await createRuntimeAttestation(session!, runtime, step.stepId);
                    return result.runtime;
                  })
                }
                disabled={busy}
              >
                ✍️ Create attestation
              </button>
            </div>

            <div className="field-row">
              <label className="field">
                Note
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Describe what you observed"
                />
              </label>
              <button
                type="button"
                className="button button--small"
                onClick={() =>
                  void runAction(async () => {
                    const result = await recordRuntimeNote(session!, runtime, step.stepId, note);
                    setNote('');
                    return result.runtime;
                  })
                }
                disabled={busy || !note.trim()}
              >
                Add note
              </button>
            </div>

            <div className="field-row">
              <label className="field">
                Measurement label
                <input
                  type="text"
                  value={measurementLabel}
                  onChange={(event) => setMeasurementLabel(event.target.value)}
                  placeholder="Pressure"
                />
              </label>
              <label className="field">
                Value
                <input
                  type="number"
                  value={measurementValue}
                  onChange={(event) => setMeasurementValue(event.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                />
              </label>
              <label className="field">
                Unit
                <input
                  type="text"
                  value={measurementUnit}
                  onChange={(event) => setMeasurementUnit(event.target.value)}
                  placeholder="bar"
                />
              </label>
              <button
                type="button"
                className="button button--small"
                onClick={() =>
                  void runAction(async () => {
                    const result = await recordRuntimeMeasurement(session!, runtime, {
                      stepId: step.stepId,
                      label: measurementLabel,
                      value: Number(measurementValue),
                      unit: measurementUnit,
                    });
                    setMeasurementLabel('');
                    setMeasurementValue('');
                    setMeasurementUnit('');
                    return result.runtime;
                  })
                }
                disabled={
                  busy || !measurementLabel.trim() || !measurementValue || !measurementUnit.trim()
                }
              >
                Add measurement
              </button>
            </div>

            {stepEvidence.length > 0 && (
              <ul className="evidence-list">
                {stepEvidence.map((record) => (
                  <li key={record.evidenceId} className="evidence-list__item">
                    <span>
                      {record.kind}
                      {record.value ? `: ${record.value}` : ''}
                    </span>
                    <time dateTime={record.capturedAtIso}>
                      {new Date(record.capturedAtIso).toLocaleTimeString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="step-card__nav">
            <span className="step-card__context">
              Completion requires at least {minimumEvidenceCount} evidence item
              {minimumEvidenceCount === 1 ? '' : 's'} and the explicit action below.
            </span>
            <button
              type="button"
              className="button"
              onClick={() =>
                void runAction(() => completeRuntimeStepForGuide(session!, runtime, step.stepId))
              }
              disabled={busy || !canComplete}
            >
              {busy ? 'Saving…' : 'Complete step →'}
            </button>
          </div>
        </article>
      ) : (
        <p className="empty-hint">
          {snapshot?.tasks.length === 0
            ? 'This guide has no tasks yet. Add them in the editor.'
            : 'Preparing the offline procedure runtime…'}
        </p>
      )}
    </section>
  );
}
