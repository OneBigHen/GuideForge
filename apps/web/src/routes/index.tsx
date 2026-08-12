import type { StorageHealth } from '@guideforge/storage-web';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { detectCapabilities, type DeviceCapabilityProfile } from '../services/capabilities';
import {
  getLastBackupAtIso,
  getStorageHealth,
  listGuides,
  type LibraryEntry,
} from '../services/guideStore';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const [guides, setGuides] = useState<LibraryEntry[]>([]);
  const [storage, setStorage] = useState<StorageHealth | null>(null);
  const [lastBackupAtIso, setLastBackupAtIso] = useState<string | null>(null);
  const [capabilities] = useState<DeviceCapabilityProfile>(() => detectCapabilities());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listGuides(), getStorageHealth(), getLastBackupAtIso()])
      .then(([nextGuides, nextStorage, nextBackup]) => {
        if (cancelled) return;
        setGuides(nextGuides);
        setStorage(nextStorage);
        setLastBackupAtIso(nextBackup);
      })
      .catch((nextError: unknown) => {
        if (!cancelled)
          setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="dashboard" aria-labelledby="home-title">
      <header className="dashboard__header">
        <div>
          <p className="eyebrow">Local-first workspace</p>
          <h1 id="home-title">Project readiness</h1>
          <p>
            Keep source-grounded guides, evidence, training, and assets ready for the next real
            procedure.
          </p>
        </div>
        <Link to="/library" className="button">
          Open guide library
        </Link>
      </header>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      <div className="dashboard-grid" aria-label="Readiness summary">
        <article className="dashboard-card">
          <p className="dashboard-card__label">Projects</p>
          <strong className="dashboard-card__value">{loading ? '…' : guides.length}</strong>
          <p>{guides.filter((guide) => guide.lifecycleState === 'published').length} published</p>
          <Link to="/library" className="button button--ghost">
            Manage projects
          </Link>
        </article>
        <article className="dashboard-card">
          <p className="dashboard-card__label">Device path</p>
          <strong className="dashboard-card__value">
            {capabilities.pointer.coarse ? 'Touch ready' : 'Pointer ready'}
          </strong>
          <p>
            {capabilities.graphics.webgl2 ? 'WebGL2 available' : '2D/spatial tree fallback'} ·{' '}
            {capabilities.platform.standalonePwa ? 'PWA' : 'browser'}
          </p>
          <Link to="/settings" className="button button--ghost">
            Review device settings
          </Link>
        </article>
        <article className="dashboard-card">
          <p className="dashboard-card__label">Local storage</p>
          <strong className="dashboard-card__value">
            {storage?.quotaWarning === 'near-limit'
              ? 'Near quota'
              : storage?.quotaWarning === 'unknown'
                ? 'Estimate unavailable'
                : 'Healthy'}
          </strong>
          <p>
            {storage?.persistentGranted ? 'Persistent storage granted' : 'Persistence not granted'}
          </p>
          <Link to="/settings" className="button button--ghost">
            Storage and backup
          </Link>
        </article>
        <article className="dashboard-card">
          <p className="dashboard-card__label">Backup</p>
          <strong className="dashboard-card__value">
            {lastBackupAtIso ? new Date(lastBackupAtIso).toLocaleDateString() : 'Not recorded'}
          </strong>
          <p>Full backups stay on the device until you download them.</p>
          <Link to="/jobs" className="button button--ghost">
            Open job center
          </Link>
        </article>
      </div>

      <section className="dashboard-section" aria-labelledby="recent-guides-title">
        <div className="dashboard-section__header">
          <h2 id="recent-guides-title">Recent projects</h2>
          <Link to="/library">View all</Link>
        </div>
        {loading ? (
          <p role="status">Loading projects…</p>
        ) : guides.length === 0 ? (
          <p className="empty-hint">No projects yet. Create one to begin authoring.</p>
        ) : (
          <ul className="dashboard-list">
            {guides.slice(0, 5).map((guide) => (
              <li key={guide.guideId}>
                <span>
                  <strong>{guide.title}</strong>
                  <small>
                    {guide.stepCount} steps · {guide.lifecycleState}
                  </small>
                </span>
                <Link
                  to="/run/$guideId"
                  params={{ guideId: guide.guideId }}
                  className="button button--small"
                >
                  Run
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
