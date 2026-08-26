import { materializeSnapshot } from '@guideforge/collaboration';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { DEMO_GUIDE_ID, ensureDemoGuide, resetDemoGuide } from '../demo/get-to-know-andrew';
import { getAiCapability } from '../services/aiProposals';
import { requestDemoAi, storeDemoProposalsLocally } from '../services/demoAi';
import { closeGuide, openGuide } from '../services/guideStore';

export const Route = createFileRoute('/demo')({
  component: DemoPage,
});

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void },
  ) => string;
  remove?: (widgetId: string) => void;
  reset: () => void;
}

let turnstileLoad: Promise<TurnstileApi | null> | undefined;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (!turnstileLoad) {
    turnstileLoad = new Promise((resolve) => {
      const existing = (globalThis as { turnstile?: TurnstileApi }).turnstile;
      if (existing) {
        resolve(existing);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve((globalThis as { turnstile?: TurnstileApi }).turnstile ?? null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }
  return turnstileLoad;
}

function DemoAiPanel() {
  const navigate = useNavigate();
  const turnstileContainer = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'disabled' | 'ready' | 'unreachable'>('loading');
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const capability = await getAiCapability();
      if (cancelled) return;
      if (!capability.reachable) {
        setState('unreachable');
        return;
      }
      if (
        !capability.available ||
        !capability.publicDemo?.enabled ||
        !capability.publicDemo.siteKey
      ) {
        setState('disabled');
        return;
      }
      setSiteKey(capability.publicDemo.siteKey);
      setState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !siteKey) return;

    let cancelled = false;
    let api: TurnstileApi | null = null;
    let widgetId: string | undefined;
    const container = turnstileContainer.current;
    if (!container) {
      setState('unreachable');
      return;
    }

    void loadTurnstile().then((loadedApi) => {
      if (cancelled || !loadedApi || !container.isConnected) return;
      api = loadedApi;
      try {
        widgetId = loadedApi.render(container, {
          sitekey: siteKey,
          callback: (nextToken) => {
            if (!cancelled) setToken(nextToken);
          },
        });
      } catch {
        if (!cancelled) setState('unreachable');
      }
    });

    return () => {
      cancelled = true;
      if (widgetId && api?.remove) api.remove(widgetId);
    };
  }, [siteKey, state]);

  async function run(): Promise<void> {
    if (!token || busy) return;
    setBusy(true);
    setResult(null);
    try {
      // Cap the request client-side too; the server re-validates everything.
      const session = await openGuide(DEMO_GUIDE_ID);
      let steps: { stepId: string; instructionText: string }[];
      let sourceHash: string;
      try {
        const snap = materializeSnapshot(session.working);
        sourceHash = snap.sources[0]?.sha256 ?? '';
        steps = snap.steps
          .slice(0, 12)
          .map((s) => ({ stepId: s.stepId, instructionText: s.instructionText.slice(0, 1500) }));
      } finally {
        await closeGuide(session);
      }
      const response = await requestDemoAi({
        guideId: DEMO_GUIDE_ID,
        steps,
        turnstileToken: token,
      });
      const created = await storeDemoProposalsLocally(response, {
        guideId: DEMO_GUIDE_ID,
        sourceHash,
      });
      setResult(
        `${created} suggestion(s) received (${response.receipt.provider}, ${response.receipt.inputTokens}+${response.receipt.outputTokens} tokens). Review and accept them on your local copy.`,
      );
    } catch (err) {
      // Visible, actionable failure — never a silent no-op.
      setResult(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <p role="status">Checking AI availability…</p>;
  if (state === 'unreachable' || state === 'disabled') {
    return (
      <p className="empty-hint">
        Real AI is not part of this demo right now. Everything else still runs fully offline.
      </p>
    );
  }

  return (
    <div className="demo-ai-panel">
      <p>
        One bounded, REAL provider call — rate-limited, budget-capped, and verified with a Turnstile
        challenge. Suggestions land as reviewable proposals on your local copy.
      </p>
      <div ref={turnstileContainer} id="demo-turnstile" aria-label="Bot verification" />
      <button type="button" className="button" disabled={!token || busy} onClick={() => void run()}>
        {busy ? 'Asking the model…' : 'Request AI suggestions'}
      </button>
      {result && (
        <>
          <p role="status" className="release-note">
            {result}
          </p>
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              void navigate({ to: '/edit/$guideId', params: { guideId: DEMO_GUIDE_ID } })
            }
          >
            Review proposals
          </button>
        </>
      )}
    </div>
  );
}

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
        <h1 id="demo-title">
          GuideForge turns source documents into guides people can actually follow.
        </h1>
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

      <section aria-labelledby="demo-ai-title">
        <h2 id="demo-ai-title">Try real AI (bounded)</h2>
        <DemoAiPanel />
      </section>
    </section>
  );
}
