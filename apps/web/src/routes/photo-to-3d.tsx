import {
  GPU_PROFILES,
  PHOTO_TO_3D_PROVIDERS,
  type PhotoMimeType,
  type PhotoTo3DProviderId,
  type PhotoViewInput,
} from '@guideforge/assets';
import { openDb, OpfsAssetStore } from '@guideforge/storage-web';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { AssetLibrary } from '../services/assetLibrary';
import {
  listPhotoTo3DJobs,
  prepareAndQueuePhotoJob,
  transitionStoredPhotoJob,
} from '../services/photoTo3d';

export const Route = createFileRoute('/photo-to-3d')({
  component: PhotoTo3DPage,
});

function PhotoTo3DPage() {
  const db = useMemo(() => openDb(), []);
  const [files, setFiles] = useState<PhotoViewInput[]>([]);
  const [providerId, setProviderId] = useState<PhotoTo3DProviderId>('tripo-sr');
  const [gpuProfileId, setGpuProfileId] = useState<(typeof GPU_PROFILES)[number]['id']>('cpu');
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [query, setQuery] = useState('');
  const [localMatches, setLocalMatches] = useState<string[]>([]);
  const [providerSearchUrl, setProviderSearchUrl] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof listPhotoTo3DJobs>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void listPhotoTo3DJobs(db).then(setJobs);
  }, [db]);

  async function chooseFiles(selected: FileList | null): Promise<void> {
    setError(null);
    setNotice(null);
    const next: PhotoViewInput[] = [];
    for (const [index, file] of Array.from(selected ?? []).entries()) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError(`${file.name}: JPEG, PNG, or WebP is required`);
        return;
      }
      next.push({
        viewId: `view-${index + 1}`,
        filename: file.name,
        mimeType: file.type as PhotoMimeType,
        bytes: new Uint8Array(await file.arrayBuffer()),
        viewLabel: file.name,
      });
    }
    setFiles(next);
  }

  async function searchBeforeGenerate(): Promise<void> {
    setError(null);
    const library = new AssetLibrary(db, new OpfsAssetStore(db));
    const plan = await library.searchPlan(query);
    setLocalMatches(plan.local.map((match) => match.name));
    setProviderSearchUrl(plan.providers[0]?.url ?? null);
  }

  async function queue(): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      const result = await prepareAndQueuePhotoJob(db, {
        views: files,
        providerId,
        gpuProfileId,
        licenseAccepted,
        jobId: `photo-${crypto.randomUUID()}`,
      });
      setJobs(await listPhotoTo3DJobs(db));
      setNotice(
        result.job.status === 'blocked'
          ? `Queued but blocked: ${result.job.error}`
          : 'Photo job queued locally. Shape approval is required before texturing.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function cancel(jobId: string): Promise<void> {
    try {
      await transitionStoredPhotoJob(db, jobId, {
        type: 'cancel',
        nowIso: new Date().toISOString(),
      });
      setJobs(await listPhotoTo3DJobs(db));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="photo-to-3d" aria-labelledby="photo-to-3d-title">
      <header className="photo-to-3d__header">
        <div>
          <Link to="/assets" className="button button--ghost button--small">
            ← Assets
          </Link>
          <h1 id="photo-to-3d-title">Photo to 3D</h1>
          <p className="empty-hint">
            Sanitize and review real equipment photos before a local GPU job can generate a reusable
            GLB.
          </p>
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

      <section className="photo-to-3d__panel" aria-labelledby="photos-title">
        <h2 id="photos-title">1. Choose photos</h2>
        <label className="button">
          Choose photos
          <input
            aria-label="Choose photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => void chooseFiles(event.currentTarget.files)}
          />
        </label>
        <p className="empty-hint">
          Use at least three distinct views. EXIF and common PNG/WebP metadata are removed before
          storage.
        </p>
        {files.length > 0 && (
          <p role="status">
            {files.length} view{files.length === 1 ? '' : 's'} selected; quality checks run when
            queued.
          </p>
        )}
      </section>

      <section className="photo-to-3d__panel" aria-labelledby="search-title">
        <h2 id="search-title">2. Search before generating</h2>
        <label className="field">
          Equipment name
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="micropipette, valve, pump…"
          />
        </label>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => void searchBeforeGenerate()}
        >
          Search local library first
        </button>
        {localMatches.length > 0 && <p role="status">Local matches: {localMatches.join(', ')}</p>}
        {providerSearchUrl && (
          <p className="empty-hint">
            No suitable local match?{' '}
            <a href={providerSearchUrl} target="_blank" rel="noreferrer">
              Review provider search
            </a>
            .
          </p>
        )}
      </section>

      <section className="photo-to-3d__panel" aria-labelledby="provider-title">
        <h2 id="provider-title">3. Select a licensed local provider</h2>
        <label className="field">
          Provider
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.currentTarget.value as PhotoTo3DProviderId)}
          >
            {Object.values(PHOTO_TO_3D_PROVIDERS).map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          GPU profile
          <select
            value={gpuProfileId}
            onChange={(event) => setGpuProfileId(event.currentTarget.value as typeof gpuProfileId)}
          >
            {GPU_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={licenseAccepted}
            onChange={(event) => setLicenseAccepted(event.currentTarget.checked)}
          />
          I reviewed the{' '}
          <a href={PHOTO_TO_3D_PROVIDERS[providerId].licenseUrl} target="_blank" rel="noreferrer">
            provider license
          </a>
          .
        </label>
        <button
          type="button"
          className="button"
          disabled={files.length === 0}
          onClick={() => void queue()}
        >
          Queue local shape draft
        </button>
        <p className="empty-hint">
          Shape-first is mandatory. Texture and Blender cleanup cannot run until an owner approves
          the draft.
        </p>
      </section>

      <section className="photo-to-3d__panel" aria-labelledby="jobs-title">
        <h2 id="jobs-title">Job center</h2>
        {jobs.length === 0 ? (
          <p className="empty-hint">No photo-to-3D jobs yet.</p>
        ) : (
          <ul className="photo-job-list">
            {jobs.map((job) => (
              <li key={job.jobId} className="photo-job-list__item">
                <strong>{job.jobId}</strong>
                <span>
                  {job.status} · {job.providerId} · {job.gpuProfileId}
                </span>
                {job.error && <span className="asset-card__warning">{job.error}</span>}
                {(job.status === 'queued' || job.status === 'blocked') && (
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => void cancel(job.jobId)}
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
