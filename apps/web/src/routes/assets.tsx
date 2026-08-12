import { ASSET_PROVIDERS, type AssetProviderId } from '@guideforge/assets';
import { openDb, OpfsAssetStore } from '@guideforge/storage-web';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AssetLibrary, type AssetLibraryEntry } from '../services/assetLibrary';

export const Route = createFileRoute('/assets')({
  component: AssetsPage,
});

function AssetsPage() {
  const [library] = useState(() => {
    const db = openDb();
    return new AssetLibrary(db, new OpfsAssetStore(db));
  });
  const [entries, setEntries] = useState<AssetLibraryEntry[]>([]);
  const [providerRequests, setProviderRequests] = useState<
    { providerId: AssetProviderId; query: string; url: string }[]
  >([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(nextQuery = query): Promise<void> {
    setEntries(await library.list());
    if (nextQuery.trim()) {
      const plan = await library.searchPlan(nextQuery);
      setProviderRequests(plan.providers);
    } else {
      setProviderRequests([]);
    }
  }

  async function importFile(file: File): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      const extension = file.name.split('.').pop() ?? '';
      await library.importBytes(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        file.type || 'application/octet-stream',
        extension,
      );
      await refresh();
      setNotice(
        extension.toLowerCase() === 'glb' || extension.toLowerCase() === 'gltf'
          ? 'Safe self-contained model imported. Review geometry before attaching it to a scene.'
          : 'Model metadata imported; companion conversion is required before scene use.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addProcedural(
    template: Parameters<AssetLibrary['addProcedural']>[0],
  ): Promise<void> {
    try {
      await library.addProcedural(template);
      await refresh();
      setNotice('Local CC0 procedural asset added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="asset-manager" aria-labelledby="assets-title">
      <header className="asset-manager__header">
        <div>
          <Link to="/library" className="button button--ghost button--small">
            ← Library
          </Link>
          <Link to="/photo-to-3d" className="button button--ghost button--small">
            Photo to 3D
          </Link>
          <h1 id="assets-title">Asset manager</h1>
          <p className="empty-hint">
            Local-first search, license gates, safe import, and provenance.
          </p>
        </div>
        <label className="button">
          Import model
          <input
            type="file"
            accept=".glb,.gltf,.obj,.stl,.step"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importFile(file);
              event.currentTarget.value = '';
            }}
          />
        </label>
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

      <section className="asset-manager__panel" aria-label="Local asset search">
        <form
          className="field-row"
          onSubmit={(event) => {
            event.preventDefault();
            void refresh();
          }}
        >
          <label className="field">
            Search local library first
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="micropipette, valve, filter…"
            />
          </label>
          <button type="submit" className="button">
            Search providers
          </button>
        </form>
        <p className="empty-hint">
          Provider links are allowlisted search requests; downloads still require per-record license
          review.
        </p>
      </section>

      <section className="asset-manager__panel" aria-labelledby="procedural-title">
        <h2 id="procedural-title">Local scientific templates</h2>
        <div className="asset-manager__templates">
          {(
            [
              'simple-pipette',
              'peristaltic-pump',
              'filter-housing',
              'cartridge',
              'workbench',
            ] as const
          ).map((template) => (
            <button
              type="button"
              className="button button--ghost"
              key={template}
              onClick={() => void addProcedural(template)}
            >
              {template}
            </button>
          ))}
        </div>
      </section>

      {providerRequests.length > 0 && (
        <section className="asset-manager__panel" aria-labelledby="providers-title">
          <h2 id="providers-title">Provider search requests</h2>
          <ul className="asset-manager__providers">
            {providerRequests.map((request) => (
              <li key={request.providerId}>
                <a href={request.url} target="_blank" rel="noreferrer">
                  {ASSET_PROVIDERS[request.providerId].name}
                </a>
                <span>{ASSET_PROVIDERS[request.providerId].licenseNote}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="asset-manager__panel" aria-labelledby="inventory-title">
        <div className="asset-manager__section-header">
          <h2 id="inventory-title">Local inventory</h2>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="empty-hint">No local assets yet.</p>
        ) : (
          <div className="asset-manager__grid">
            {entries.map((entry) => (
              <article className="asset-manager__card" key={entry.hash}>
                <h3>{entry.metadata?.name ?? entry.hash.slice(0, 12)}</h3>
                <p className="asset-card__meta">
                  {entry.metadata?.format ?? entry.meta.extension} · {entry.meta.sizeBytes} bytes ·{' '}
                  {entry.metadata?.reviewState ?? 'unreviewed'}
                </p>
                <p className="asset-card__meta">SHA-256: {entry.hash}</p>
                {entry.metadata?.geometryHealth && (
                  <p className="asset-card__meta">
                    {entry.metadata.geometryHealth.triangleCount} triangles ·{' '}
                    {entry.metadata.geometryHealth.vertexCount} vertices
                  </p>
                )}
                {entry.conversionRequired && (
                  <p className="asset-card__warning">
                    Companion conversion required before scene use.
                  </p>
                )}
                {entry.licenseBlocks.length > 0 && (
                  <p className="asset-card__warning">License: {entry.licenseBlocks.join('; ')}</p>
                )}
                <p className="asset-card__meta">
                  Preview/turntable derivatives: {entry.metadata?.derivativeHashes.length ?? 0}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
