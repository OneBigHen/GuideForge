import type { PhotoTo3DJob } from '@guideforge/assets';
import { openDb } from '@guideforge/storage-web';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { listPhotoTo3DJobs, transitionStoredPhotoJob } from '../services/photoTo3d';

export const Route = createFileRoute('/jobs')({
  component: JobsPage,
});

function statusLabel(job: PhotoTo3DJob): string {
  if (job.status === 'awaiting-approval') return 'Awaiting owner approval';
  if (job.status === 'shape-draft') return 'Shape draft';
  return job.status.replaceAll('-', ' ');
}

function canPause(job: PhotoTo3DJob): boolean {
  return !['blocked', 'failed', 'paused', 'completed', 'cancelled'].includes(job.status);
}

function JobsPage() {
  const db = useMemo(() => openDb(), []);
  const [jobs, setJobs] = useState<PhotoTo3DJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      setJobs(await listPhotoTo3DJobs(db));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void listPhotoTo3DJobs(db)
      .then((nextJobs) => {
        if (!cancelled) setJobs(nextJobs);
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
  }, [db]);

  async function transition(job: PhotoTo3DJob, type: 'pause' | 'resume' | 'cancel') {
    setBusyJobId(job.jobId);
    try {
      await transitionStoredPhotoJob(db, job.jobId, {
        type,
        nowIso: new Date().toISOString(),
      });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <section className="jobs-page" aria-labelledby="jobs-title">
      <header className="jobs-page__header">
        <div>
          <p className="eyebrow">Local queue</p>
          <h1 id="jobs-title">Job center</h1>
          <p>
            Photo-to-3D jobs are local-only here; provider execution and cloud cost are not hidden.
          </p>
        </div>
        <div className="jobs-page__actions">
          <Link to="/photo-to-3d" className="button button--ghost">
            New photo job
          </Link>
          <button type="button" className="button button--ghost" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <p className="empty-hint">No local jobs yet.</p>
      ) : (
        <ul className="jobs-list">
          {jobs.map((job) => (
            <li key={job.jobId} className="job-card">
              <div className="job-card__header">
                <div>
                  <h2>{job.jobId}</h2>
                  <p className="job-card__status">{statusLabel(job)}</p>
                </div>
                <span className="status-pill">Local-only</span>
              </div>
              <dl className="job-card__meta">
                <div>
                  <dt>Stage</dt>
                  <dd>{job.stage}</dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{job.provenance.provider}</dd>
                </div>
                <div>
                  <dt>GPU</dt>
                  <dd>{job.gpuProfileId}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>Not metered locally</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{new Date(job.updatedAtIso).toLocaleString()}</dd>
                </div>
              </dl>
              {job.error && <p className="error-text">{job.error}</p>}
              <div className="job-card__actions">
                {job.status === 'paused' && (
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busyJobId === job.jobId}
                    onClick={() => void transition(job, 'resume')}
                  >
                    Resume
                  </button>
                )}
                {canPause(job) && (
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busyJobId === job.jobId}
                    onClick={() => void transition(job, 'pause')}
                  >
                    Pause
                  </button>
                )}
                {!['completed', 'cancelled'].includes(job.status) && (
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={busyJobId === job.jobId}
                    onClick={() => void transition(job, 'cancel')}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
