import { materializeSnapshot } from '@guideforge/collaboration';
import type { GuideCommand } from '@guideforge/commands';
import { GUIDE_COMMAND_TYPES } from '@guideforge/commands';
import type { GuideSnapshot } from '@guideforge/guide-schema';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import {
  addTask,
  closeGuide,
  dispatchCommand,
  exportDraft,
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
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((s: OpenGuideSession) => {
    setSnapshot(materializeSnapshot(s.working));
    setTitle(s.working.guide.get('title') as string);
  }, []);

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
        refresh(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef) void closeGuide(sessionRef);
    };
  }, [guideId, refresh]);

  async function handleRename() {
    if (!session || !title.trim()) return;
    try {
      await renameGuide(session, title.trim());
      refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddTask() {
    if (!session) return;
    try {
      await addTask(session, `Task ${(snapshot?.tasks.length ?? 0) + 1}`);
      refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemoveTask(taskId: string) {
    if (!session) return;
    const command: GuideCommand = {
      commandId: crypto.randomUUID(),
      commandType: GUIDE_COMMAND_TYPES.removeTask,
      actorId: 'local-user',
      guideId: guideId as GuideCommand['guideId'],
      origin: 'user',
      occurredAt: new Date().toISOString(),
      payload: { taskId },
    };
    try {
      await dispatchCommand(session, command);
      refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExport() {
    if (!session) return;
    try {
      const { bytes, filename } = await exportDraft(session);
      const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section aria-labelledby="edit-title">
      <div className="edit-header">
        <Link to="/library" className="button button--ghost">
          ← Library
        </Link>
        <h1 id="edit-title">Edit guide</h1>
      </div>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      {session ? (
        <div className="edit-body">
          <div className="field-row">
            <label className="field">
              <span>Title</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button type="button" className="button" onClick={() => void handleRename()}>
              Rename
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void handleExport()}
            >
              Export .gforge
            </button>
          </div>

          <div className="task-block">
            <h2>Tasks</h2>
            {snapshot?.tasks.length === 0 && <p className="empty-hint">No tasks yet.</p>}
            <ul className="task-list">
              {snapshot?.tasks.map((task) => (
                <li key={task.taskId} className="task-list__item">
                  <span>{task.title}</span>
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => void handleRemoveTask(task.taskId)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="button" onClick={() => void handleAddTask()}>
              Add task
            </button>
          </div>
        </div>
      ) : (
        <p>Opening guide…</p>
      )}
    </section>
  );
}
