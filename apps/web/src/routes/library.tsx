import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  createGuide,
  importDraft,
  importMsGuidePackage,
  listGuides,
  type LibraryEntry,
} from '../services/guideStore';

export const Route = createFileRoute('/library')({
  component: LibraryPage,
});

function LibraryPage() {
  const navigate = useNavigate();
  const [guides, setGuides] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listGuides();
        if (!cancelled) setGuides(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    try {
      const session = await createGuide(newTitle.trim());
      setNewTitle('');
      // Navigate to the edit page through the router (browser history).
      void navigate({ to: '/edit/$guideId', params: { guideId: session.guideId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await importDraft(bytes);
      setError(null);
      void navigate({ to: '/edit/$guideId', params: { guideId: result.guideId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleImportMsGuide(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await importMsGuidePackage(bytes, file.name);
      setError(null);
      void navigate({ to: '/edit/$guideId', params: { guideId: result.guideId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section aria-labelledby="library-title">
      <h1 id="library-title">Guide library</h1>
      <p>
        <Link to="/assets" className="button button--ghost button--small">
          Open asset manager
        </Link>
      </p>

      <div className="library-actions">
        <label className="field">
          <span>New guide title</span>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder="e.g. Calibrate the pipetting robot"
          />
        </label>
        <button type="button" className="button" onClick={() => void handleCreate()}>
          Create guide
        </button>
        <label className="button button--ghost">
          Import .gforge
          <input
            type="file"
            accept=".gforge"
            className="visually-hidden"
            onChange={(e) => void handleImport(e)}
          />
        </label>
        <label className="button button--ghost">
          Import .guide
          <input
            type="file"
            accept=".guide"
            className="visually-hidden"
            onChange={(e) => void handleImportMsGuide(e)}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      {loading ? (
        <p>Loading library…</p>
      ) : guides.length === 0 ? (
        <p className="empty-hint">No guides yet. Create or import one to get started.</p>
      ) : (
        <ul className="guide-list">
          {guides.map((g) => (
            <li key={g.guideId} className="guide-list__item">
              <div>
                <strong>{g.title}</strong>
                <span className="guide-list__meta">
                  {g.lifecycleState} · {g.taskCount} tasks · updated{' '}
                  {new Date(g.updatedAtIso).toLocaleString()}
                </span>
              </div>
              <Link
                to="/run/$guideId"
                params={{ guideId: g.guideId }}
                className="button button--small"
              >
                Run
              </Link>
              <Link
                to="/edit/$guideId"
                params={{ guideId: g.guideId }}
                className="button button--ghost button--small"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
