import { materializeSnapshot } from '@guideforge/collaboration';
import type { GuideCommand } from '@guideforge/commands';
import { GUIDE_COMMAND_TYPES } from '@guideforge/commands';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { ProposalsPanel } from '../components/editor/ProposalsPanel';
import { StepEditor } from '../components/editor/StepEditor';
import {
  addStep,
  addTask,
  closeGuide,
  dispatchCommand,
  exportDraft,
  exportSignedRelease,
  generateFakeProposals,
  openGuide,
  renameGuide,
  type OpenGuideSession,
} from '../services/guideStore';

export const Route = createFileRoute('/edit/$guideId')({
  component: EditPage,
});

function EditPage() {
  const { guideId } = Route.useParams();
  const [session, setSession] = useState<OpenGuideSession | null>(null);
  const [title, setTitle] = useState('');
  const [snapshot, setSnapshot] = useState<GuideSnapshot | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [releaseInfo, setReleaseInfo] = useState<string | null>(null);
  const [showProposals, setShowProposals] = useState(false);

  const refresh = useCallback(
    (s: OpenGuideSession) => {
      const snap = materializeSnapshot(s.working);
      setSnapshot(snap);
      setTitle(snap.title);
      if (!selectedTaskId && snap.tasks.length > 0) setSelectedTaskId(snap.tasks[0]!.taskId);
      if (!selectedStepId && snap.tasks.length > 0) {
        const first = snap.tasks[0];
        if (first && first.stepIds.length > 0) setSelectedStepId(first.stepIds[0]!);
      }
    },
    [selectedTaskId, selectedStepId],
  );

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
        setSnapshot(materializeSnapshot(s.working));
        setTitle(s.working.guide.get('title') as string);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef) void closeGuide(sessionRef);
    };
  }, [guideId]);

  async function run(fn: () => Promise<void>) {
    if (!session) return;
    try {
      await fn();
      refresh(session);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function currentTask() {
    return snapshot?.tasks.find((t) => t.taskId === selectedTaskId) ?? null;
  }

  function currentStep() {
    return snapshot?.steps.find((s) => s.stepId === selectedStepId) ?? null;
  }

  async function handleCreateTask() {
    if (!newTaskTitle.trim()) return;
    const taskId = await addTask(session!, newTaskTitle.trim());
    setNewTaskTitle('');
    setSelectedTaskId(taskId);
    refresh(session!);
  }

  async function handleCreateStep() {
    const task = currentTask();
    if (!task) return;
    const stepId = await addStep(session!, task.taskId, 'New step — click to edit');
    setSelectedStepId(stepId);
    refresh(session!);
  }

  async function handleGenerateProposals() {
    if (!session) return;
    await generateFakeProposals(session);
    setShowProposals(true);
  }

  function handleExportRelease() {
    if (!session) return;
    try {
      const { bytes, filename, publicKeyHex } = exportSignedRelease(session, '1.0.0');
      const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setReleaseInfo(`Exported signed release. Public key: ${publicKeyHex.slice(0, 16)}…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const task = currentTask();
  const step = currentStep();

  return (
    <section className="editor-layout" aria-labelledby="edit-title">
      <div className="edit-header">
        <Link to="/library" className="button button--ghost">
          ← Library
        </Link>
        <h1 id="edit-title">Edit guide</h1>
        <div className="edit-header__actions">
          <Link to="/scene/$guideId" params={{ guideId }} className="button button--small">
            Spatial editor
          </Link>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void handleGenerateProposals()}
          >
            Generate AI proposals
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void exportDraft(session!)}
          >
            Export .gforge
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => handleExportRelease()}
            title="Export an Ed25519-signed release package"
          >
            Export release
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {releaseInfo && (
        <p role="status" className="release-note">
          {releaseInfo}
        </p>
      )}

      {session && snapshot ? (
        <div className="editor-grid">
          {/* Left: outline rail */}
          <aside className="editor-outline" aria-label="Guide outline">
            <div className="field">
              <label htmlFor="guide-title">Guide title</label>
              <input
                id="guide-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim()) void run(() => renameGuide(session, title.trim()));
                }}
              />
            </div>

            <h2 className="editor-section-title">Tasks</h2>
            <ul className="task-rail">
              {snapshot.tasks.map((t) => (
                <li key={t.taskId}>
                  <button
                    type="button"
                    className={`task-rail__item ${t.taskId === selectedTaskId ? 'task-rail__item--active' : ''}`}
                    onClick={() => {
                      setSelectedTaskId(t.taskId);
                      setSelectedStepId(t.stepIds[0] ?? null);
                    }}
                  >
                    {t.title}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove task ${t.title}`}
                    onClick={() =>
                      void run(() =>
                        dispatchCommand(session, {
                          commandId: crypto.randomUUID(),
                          commandType: GUIDE_COMMAND_TYPES.removeTask,
                          actorId: 'local-user',
                          guideId: session.guideId as GuideCommand['guideId'],
                          origin: 'user',
                          occurredAt: new Date().toISOString(),
                          payload: { taskId: t.taskId },
                        }),
                      )
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="field-row">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="New task"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateTask();
                }}
              />
              <button
                type="button"
                className="button button--small"
                onClick={() => void handleCreateTask()}
              >
                Add
              </button>
            </div>

            {task && (
              <>
                <h2 className="editor-section-title">Steps</h2>
                <ol className="step-rail">
                  {task.stepIds.map((stepId, idx) => {
                    const st = snapshot.steps.find((s) => s.stepId === stepId);
                    return (
                      <li key={stepId}>
                        <button
                          type="button"
                          className={`step-rail__item ${stepId === selectedStepId ? 'step-rail__item--active' : ''}`}
                          onClick={() => setSelectedStepId(stepId)}
                        >
                          <span className="step-rail__num">{idx + 1}</span>
                          {st?.instructionText.slice(0, 40) ?? 'Untitled step'}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => void handleCreateStep()}
                >
                  Add step
                </button>
              </>
            )}
          </aside>

          {/* Center: step editor */}
          <div className="editor-main">
            {step ? (
              <StepEditor session={session} step={step} onChanged={() => refresh(session)} />
            ) : (
              <p className="empty-hint">
                {snapshot.tasks.length === 0
                  ? 'Create a task to begin.'
                  : 'Select or create a step to edit it.'}
              </p>
            )}
          </div>

          {/* Right: proposals */}
          {showProposals && (
            <aside className="editor-proposals" aria-label="AI proposals">
              <ProposalsPanel
                session={session}
                onChanged={() => refresh(session)}
                onClose={() => setShowProposals(false)}
              />
            </aside>
          )}
        </div>
      ) : (
        <p>Opening guide…</p>
      )}
    </section>
  );
}
