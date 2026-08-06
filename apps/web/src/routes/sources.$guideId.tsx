import type { CancellationToken } from '@guideforge/ingestion';
import type { SourceRecord } from '@guideforge/storage-web';
import { OpfsAssetStore, openDb } from '@guideforge/storage-web';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  addSource,
  listSources,
  makeCancellationToken,
  removeSource,
  type SourceStudio,
} from '../services/sourceStudio';

export const Route = createFileRoute('/sources/$guideId')({
  component: SourcesPage,
});

const KIND_LABEL: Record<string, string> = {
  pdf: 'PDF document',
  docx: 'Word document',
  pptx: 'Presentation',
  xlsx: 'Spreadsheet',
  csv: 'CSV',
  html: 'Web page',
  text: 'Text',
  markdown: 'Markdown',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  unknown: 'Unknown',
};

function SourcesPage() {
  const { guideId } = Route.useParams();
  const [studio] = useState<SourceStudio>(() => {
    const db = openDb();
    return { db, assets: new OpfsAssetStore(db) };
  });
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const tokenRef = useRef<CancellationToken | null>(null);

  const refresh = async () => {
    const rows = await listSources(studio, guideId);
    setSources(rows);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await listSources(studio, guideId);
      if (!cancelled) setSources(rows);
    })();
    return () => {
      cancelled = true;
      tokenRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideId, studio]);

  async function handleFiles(files: FileList | File[]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    tokenRef.current = makeCancellationToken().token;
    try {
      const fileList = Array.from(files);
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]!;
        setProgress(`Ingesting ${file.name} (${i + 1}/${fileList.length})…`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await addSource(studio, {
          guideId,
          originalFilename: file.name,
          bytes,
          token: tokenRef.current,
        });
        if (!res.verdict.accepted) {
          setError(`Rejected ${file.name}: ${res.verdict.reason}`);
          continue;
        }
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
      tokenRef.current = null;
    }
  }

  async function handleRemove(sourceId: string) {
    await removeSource(studio, sourceId);
    await refresh();
  }

  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  const active = sources.find((s) => s.sha256 === selectedHash);

  return (
    <main className="scene-page" aria-labelledby="sources-title">
      <div className="scene-toolbar">
        <h1 id="sources-title">Source Studio</h1>
        <div className="scene-toolbar__actions">
          <Link to="/edit/$guideId" params={{ guideId }} className="button button--ghost">
            Back to editor
          </Link>
          <Link to="/scene/$guideId" params={{ guideId }} className="button button--ghost">
            Spatial editor
          </Link>
        </div>
      </div>

      <section className="scene-panel" aria-label="Upload sources">
        <h2>Upload sources</h2>
        <p className="empty-hint">
          PDF, DOCX, PPTX, XLSX/CSV, HTML, images, audio, and video are hashed immutably (SHA-256),
          detected by content, and converted into stable, citable source regions. Text sources
          convert fully offline.
        </p>
        <div className="field-row">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.xlsx,.csv,.html,.htm,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.svg,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.mov"
            aria-label="Choose source files"
            onChange={(e) => e.target.files && void handleFiles(e.target.files)}
            disabled={busy}
          />
        </div>
        <p role="status" aria-live="polite" className="status-line">
          {progress ?? ''}
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </section>

      <section className="scene-panel" aria-label="Source list">
        <h2>Sources ({sources.length})</h2>
        {sources.length === 0 ? (
          <p className="empty-hint">
            No sources yet. Upload a document to start building a citation-backed guide.
          </p>
        ) : (
          <ul className="source-list">
            {sources.map((s) => (
              <li key={s.sourceId} className="source-card">
                <div className="source-card__header">
                  <button
                    type="button"
                    className="source-card__title"
                    onClick={() => {
                      toggle(s.sourceId);
                      setSelectedHash(s.sha256);
                    }}
                    aria-expanded={expanded[s.sourceId] ?? false}
                  >
                    <span aria-hidden="true">{expanded[s.sourceId] ? '▾' : '▸'}</span>{' '}
                    {s.originalFilename}
                  </button>
                  <span className="source-badge">{KIND_LABEL[s.kind] ?? s.kind}</span>
                  <button
                    type="button"
                    className="button button--small button--ghost"
                    onClick={() => void handleRemove(s.sourceId)}
                  >
                    Remove
                  </button>
                </div>
                <div className="source-card__meta">
                  <span>{s.regions.length} regions</span>
                  <span>route: {s.ocrRoute}</span>
                  <span>status: {s.status}</span>
                  <span title={s.sha256}>{s.sha256.slice(0, 12)}…</span>
                </div>
                {s.conflicts.length > 0 && (
                  <p className="source-warning" role="alert">
                    Conflict: {s.conflicts.map((c) => c.kind).join(', ')}
                  </p>
                )}
                {expanded[s.sourceId] && (
                  <div className="source-detail">
                    <h3>Regions</h3>
                    <ol className="region-list">
                      {s.regions.map((r) => (
                        <li key={r.regionId} className="region-row">
                          <code>{r.regionId}</code>
                          <span className="region-page">p{r.pageIndex + 1}</span>
                          <span className="region-kind">{r.kind}</span>
                          <span className="region-excerpt">{r.excerpt}</span>
                        </li>
                      ))}
                      {s.regions.length === 0 && (
                        <li className="empty-hint">
                          No text regions (image/audio/video sources route to OCR/ASR).
                        </li>
                      )}
                    </ol>
                    {s.tables.length > 0 && (
                      <>
                        <h3>Tables</h3>
                        {s.tables.map((t) => (
                          <table key={t.regionId} className="data-table">
                            <thead>
                              <tr>
                                {t.header.map((h, i) => (
                                  <th key={i}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {t.rows.map((row, ri) => (
                                <tr key={ri}>
                                  {row.map((cell, ci) => (
                                    <td key={ci}>{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ))}
                      </>
                    )}
                    {s.mediaSegments.length > 0 && (
                      <>
                        <h3>Media segments</h3>
                        <ul className="media-list">
                          {s.mediaSegments.map((m) => (
                            <li key={m.segmentId}>
                              <code>{m.segmentId}</code> {m.startSec}s–{m.endSec}s{' '}
                              <span className="region-kind">{m.kind}</span>
                              {m.transcript ? ` — ${m.transcript}` : ''}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {s.receipt && (
                      <>
                        <h3>Conversion receipt</h3>
                        <dl className="receipt-grid">
                          <dt>Converter</dt>
                          <dd>
                            {s.receipt.converter}@{s.receipt.converterVersion}
                          </dd>
                          <dt>Pipeline</dt>
                          <dd>v{s.receipt.pipelineVersion}</dd>
                          <dt>Status</dt>
                          <dd>{s.receipt.status}</dd>
                          <dt>Duration</dt>
                          <dd>{s.receipt.durationMs}ms</dd>
                          <dt>Regions</dt>
                          <dd>{s.receipt.regionCount}</dd>
                          <dt>Tables</dt>
                          <dd>{s.receipt.tableCount}</dd>
                          <dt>Media</dt>
                          <dd>{s.receipt.mediaSegmentCount}</dd>
                          <dt>Notes</dt>
                          <dd>{s.receipt.notes.join(', ') || '—'}</dd>
                        </dl>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {active && <SourceDetailPreview key={active.sha256} source={active} />}
    </main>
  );
}

function SourceDetailPreview({ source }: { source: SourceRecord }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (source.kind !== 'text' && source.kind !== 'csv') return;
    void (async () => {
      try {
        const db = openDb();
        const store = new OpfsAssetStore(db);
        const bytes = await store.get(source.sha256 as Parameters<typeof store.get>[0]);
        if (!cancelled) {
          if (!bytes) setPreviewError('Source bytes not found (stored elsewhere).');
          else setPreview(new TextDecoder('utf-8').decode(bytes).slice(0, 4000));
        }
      } catch (err) {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source.sha256, source.kind]);

  return (
    <section className="scene-panel" aria-label="Source preview">
      <h2>Preview — {source.originalFilename}</h2>
      <p className="empty-hint">
        sha256: <code>{source.sha256}</code>
      </p>
      {previewError && (
        <p role="alert" className="error-text">
          {previewError}
        </p>
      )}
      {preview && <pre className="source-preview">{preview}</pre>}
      {!preview && !previewError && (
        <p className="empty-hint">No local text preview (binary or OCR/ASR-routed source).</p>
      )}
    </section>
  );
}
