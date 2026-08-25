import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ensureDemoGuide, resetDemoGuide } from '../demo/get-to-know-andrew';

export const Route = createFileRoute('/demo')({
  component: DemoPage,
});

function DemoPage() {
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch(): Promise<void> {
    setLaunching(true);
    setError(null);
    try {
      const result = await ensureDemoGuide();
      void navigate({ to: '/run/$guideId', params: { guideId: result.guideId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLaunching(false);
    }
  }

  async function reset(): Promise<void> {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setLaunching(true);
    setError(null);
    try {
      await resetDemoGuide();
      setConfirmingReset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  }

  return (
    <section className="demo-landing" aria-labelledby="demo-title">
      <header>
        <p className="empty-hint">Public demo · everything below runs locally in your browser</p>
        <h1 id="demo-title">GuideForge turns source documents into verifiable, runnable procedures.</h1>
        <p>
          Author once from cited sources, then run the guide anywhere — with interactive assets,
          execution evidence, and offline training.
        </p>
      </header>

      <button
        type="button"
        className="button button--primary"
        disabled={launching}
        onClick={() => void launch()}
      >
        {launching ? 'Preparing demo…' : 'Launch demo'}
      </button>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      <ul className="demo-proof-points">
        <li>
          <h2>Guided procedures</h2>
          <p>
            Step through a sample onboarding procedure with tools, warnings, verification checks,
            and completion tracking.
          </p>
        </li>
        <li>
          <h2>Cited, reviewable AI</h2>
          <p>
            AI assistance proposes changes that cite their sources — and never edits your guides
            silently.
          </p>
        </li>
        <li>
          <h2>Interactive 3D &amp; assets</h2>
          <p>
            Deterministic procedural models attach directly to steps; no downloads or accounts
            required.
          </p>
        </li>
      </ul>

      <section aria-label="Demo data" className="demo-landing__reset">
        <h2>Your demo data</h2>
        <p>The demo guide lives only in this browser. Resetting recreates the pristine sample.</p>
        <button
          type="button"
          className="button button--ghost button--small"
          disabled={launching}
          onClick={() => void reset()}
        >
          {confirmingReset ? 'Really erase local demo data?' : 'Reset local demo data'}
        </button>
        {confirmingReset && (
          <button
            type="button"
            className="button button--ghost button--small"
            disabled={launching}
            onClick={() => setConfirmingReset(false)}
          >
            Cancel
          </button>
        )}
      </section>
    </section>
  );
}
