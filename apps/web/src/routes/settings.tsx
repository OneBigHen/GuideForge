import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

interface Capabilities {
  authenticated: boolean;
  auth: {
    ownerConfigured: boolean;
    passkey: { available: boolean; seam: string };
  };
  features: { encryptedProviderSecrets: boolean; pairing: boolean };
  transport: { httpsRequiredForNonLoopback: boolean; secureCookies: boolean };
}

interface OwnerStatus {
  configured: boolean;
  displayName: string | null;
}

interface Settings {
  origins: string[];
  transport: { host: string; secureCookies: boolean };
  secrets: { name: string; updatedAt: number }[];
  passkey: { available: boolean; seam: string };
}

const companionBase =
  (import.meta.env.VITE_COMPANION_URL as string | undefined)?.replace(/\/$/, '') ?? '';

async function companionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${companionBase}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Companion request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadCompanion(): Promise<{
  capabilities: Capabilities;
  owner: OwnerStatus;
  settings: Settings | null;
}> {
  const [capabilities, owner] = await Promise.all([
    companionRequest<Capabilities>('/api/capabilities'),
    companionRequest<OwnerStatus>('/api/owner/status'),
  ]);
  return {
    capabilities,
    owner,
    settings: capabilities.authenticated ? await companionRequest<Settings>('/api/settings') : null,
  };
}

function SettingsPage() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [owner, setOwner] = useState<OwnerStatus | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [secretName, setSecretName] = useState('deepseek');
  const [secretValue, setSecretValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const next = await loadCompanion();
      setCapabilities(next.capabilities);
      setOwner(next.owner);
      setSettings(next.settings);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadCompanion()
      .then((next) => {
        if (cancelled) return;
        setCapabilities(next.capabilities);
        setOwner(next.owner);
        setSettings(next.settings);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(path: string, body: Record<string, string>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await companionRequest<{ recoveryCode?: string; pairingCode?: string }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (result.recoveryCode) setRecoveryCode(result.recoveryCode);
      if (result.pairingCode) setPairingCode(result.pairingCode);
      setPassword('');
      setNotice(success);
      await refresh();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function submit(
    event: FormEvent,
    path: string,
    body: Record<string, string>,
    success: string,
  ) {
    event.preventDefault();
    await runAction(path, body, success);
  }

  async function saveSecret(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await companionRequest(`/api/settings/secrets/${encodeURIComponent(secretName)}`, {
        method: 'PUT',
        body: JSON.stringify({ value: secretValue }),
      });
      setSecretValue('');
      setNotice(`${secretName} secret saved without returning its value.`);
      await refresh();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="shell-card" aria-labelledby="settings-title">
        <h1 id="settings-title">Companion settings</h1>
        <p>Checking the local companion…</p>
      </section>
    );
  }

  if (!capabilities || !owner) {
    return (
      <section className="shell-card" aria-labelledby="settings-title">
        <h1 id="settings-title">Companion settings</h1>
        <p role="alert" className="error-text">
          {error ?? 'The companion is unavailable.'}
        </p>
        <button type="button" className="button" onClick={() => void refresh()}>
          Retry connection
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="settings-title">
      <div className="edit-header">
        <div>
          <h1 id="settings-title">Companion settings</h1>
          <p>
            Secure the local services used by GuideForge on this device and your iPad or iPhone.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {recoveryCode && (
        <p className="settings-code" role="status">
          Save this one-time recovery code now: <code>{recoveryCode}</code>
        </p>
      )}

      {!owner.configured ? (
        <form
          className="shell-card settings-card"
          onSubmit={(event) =>
            void submit(event, '/api/owner/setup', { displayName, password }, 'Owner created.')
          }
        >
          <h2>First-run owner setup</h2>
          <p>The owner password is hashed with Argon2id and is the only login credential.</p>
          <label className="field">
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password (12 characters minimum)</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="button" type="submit" disabled={busy}>
            Create owner
          </button>
        </form>
      ) : !capabilities.authenticated ? (
        <form
          className="shell-card settings-card"
          onSubmit={(event) => void submit(event, '/api/auth/login', { password }, 'Signed in.')}
        >
          <h2>Owner sign-in</h2>
          <p>{owner.displayName} is configured. A user ID alone cannot sign in.</p>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="button" type="submit" disabled={busy}>
            Sign in
          </button>
        </form>
      ) : (
        <div className="settings-grid">
          <article className="shell-card settings-card">
            <h2>Connection</h2>
            <p>Signed in as {owner.displayName}.</p>
            <dl className="settings-meta">
              <div>
                <dt>Transport</dt>
                <dd>{settings?.transport.host ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>LAN policy</dt>
                <dd>
                  {capabilities.transport.httpsRequiredForNonLoopback
                    ? 'HTTPS required'
                    : 'Loopback only'}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={() => void runAction('/api/auth/logout', {}, 'Signed out.')}
            >
              Sign out
            </button>
          </article>

          <article className="shell-card settings-card">
            <h2>Pair another device</h2>
            <p>Generate a one-time code for a securely connected iPad or iPhone.</p>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void runAction(
                  '/api/pairings',
                  { label: 'GuideForge device' },
                  'Pairing code created.',
                )
              }
            >
              Create pairing code
            </button>
            {pairingCode && (
              <p className="settings-code">
                Enter this once on the other device: <code>{pairingCode}</code>
              </p>
            )}
          </article>

          <article className="shell-card settings-card settings-card--wide">
            <h2>Provider and signing secrets</h2>
            <p>Values are encrypted at rest and are never returned to the browser.</p>
            <form className="field-row" onSubmit={(event) => void saveSecret(event)}>
              <label className="field">
                <span>Secret name</span>
                <input
                  value={secretName}
                  onChange={(event) => setSecretName(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Secret value</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                  required
                />
              </label>
              <button className="button" type="submit" disabled={busy}>
                Save encrypted secret
              </button>
            </form>
            <p>
              Configured:{' '}
              {settings?.secrets.length
                ? settings.secrets.map((secret) => secret.name).join(', ')
                : 'none'}
            </p>
            <p>
              Passkey support:{' '}
              {settings?.passkey.available ? 'available' : `seam ${settings?.passkey.seam}`}
            </p>
          </article>
        </div>
      )}
    </section>
  );
}
