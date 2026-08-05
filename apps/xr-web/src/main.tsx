/**
 * GuideForge XR release viewer.
 *
 * Consumes an immutable, signed `.gforge` release (guide.json + assets +
 * signatures) and renders it:
 *  - inline 3D in every browser,
 *  - immersive WebXR on Quest/Android (React Three XR),
 *  - Apple Quick Look via USDZ derivative link when available.
 *
 * The viewer is read-only: it never mutates drafts and only renders released
 * content after offline signature verification.
 */
import { verifyReleasePackage } from '@guideforge/package-gforge';
import { strFromU8, unzipSync } from 'fflate';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SceneCanvas } from './SceneCanvas';
import './styles.css';

function loadRelease(bytes: Uint8Array): {
  guideJson: unknown;
  entries: Map<string, Uint8Array>;
  signed: boolean;
} {
  const verification = verifyReleasePackage(bytes);
  if (!verification.ok) {
    throw new Error(`release verification failed: ${verification.issues.join('; ')}`);
  }
  const unzipped = unzipSync(bytes);
  const entries = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(unzipped)) {
    entries.set(path, data);
  }
  const guide = entries.get('guide.json');
  if (!guide) throw new Error('release missing guide.json');
  // Unsigned personal releases are structurally valid but carry no trust;
  // surface that visibly (Phase 01: browsers never hold signing keys).
  const manifest = JSON.parse(strFromU8(entries.get('manifest.json') ?? new Uint8Array())) as {
    signed?: boolean;
  };
  return { guideJson: JSON.parse(strFromU8(guide)), entries, signed: manifest.signed === true };
}

function App() {
  const [state, setState] = useState<{ guide: unknown; entries: Map<string, Uint8Array> } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [usdzUrl, setUsdzUrl] = useState<string | null>(null);
  const [signed, setSigned] = useState<boolean | null>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { guideJson, entries, signed: isSigned } = loadRelease(bytes);
      setState({ guide: guideJson, entries });
      setSigned(isSigned);
      // Apple Quick Look: if the release carries a USDZ derivative, offer it.
      const usdz = entries.get('previews/release.usdz');
      if (usdz)
        setUsdzUrl(
          URL.createObjectURL(new Blob([usdz as BlobPart], { type: 'model/vnd.usdz+zip' })),
        );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const guide = state?.guide as { title?: string } | undefined;

  return (
    <div className="viewer">
      <header className="viewer__header">
        <h1>GuideForge XR Viewer</h1>
        <label className="viewer__open">
          Open signed release (.gforge)
          <input
            type="file"
            accept=".gforge"
            onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
          />
        </label>
      </header>

      {error && (
        <p role="alert" className="viewer__error">
          {error}
        </p>
      )}

      {guide && (
        <p className="viewer__guide">
          <strong>{guide.title ?? 'Untitled release'}</strong> — verified offline
          {signed === false && (
            <span className="viewer__trust-warning" role="note">
              {' '}
              (unsigned personal release — trust not verified)
            </span>
          )}
          {usdzUrl && (
            <a href={usdzUrl} rel="ar" className="viewer__ql">
              View in AR (Quick Look)
            </a>
          )}
        </p>
      )}

      {state ? (
        <SceneCanvas entries={state.entries} />
      ) : (
        <p className="viewer__hint">
          Open a signed release to render it inline or in immersive WebXR (Quest / Android ARCore).
        </p>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
