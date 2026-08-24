import type { StorageHealth } from '@guideforge/storage-web';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { companionRequest } from '../services/companionClient';
import {
  getLastBackupAtIso,
  getStorageHealth,
  requestStoragePersistence,
} from '../services/guideStore';

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
  signingKeys: {
    keyId: string;
    publicKeyHex: string;
    createdAt: number;
    status: 'active' | 'revoked' | 'retired';
  }[];
  passkey: { available: boolean; seam: string };
}

function formatBytes(value: number | null): string {
  if (value === null) return 'Unavailable';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KiB`;
  return `${(value / (1024 * 1024 * 1024) >= 1 ? value / (1024 * 1024 * 1024) : value / (1024 * 1024)).toFixed(1)} ${value / (1024 * 1024 * 1024) >= 1 ? 'GiB' : 'MiB'}`;
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
    companionRequest<Capabilities | null>('/api/capabilities'),
    companionRequest<OwnerStatus>('/api/owner/status'),
  ]);
  if (!capabilities || typeof capabilities !== 'object') {
    throw new Error('Companion returned an invalid capabilities response.');
  }
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
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [lastBackupAtIso, setLastBackupAtIso] = useState<string | null>(null);

  async function refreshStorage() {
    try {
      const [health, backupAtIso] = await Promise.all([getStorageHealth(), getLastBackupAtIso()]);
      setStorageHealth(health);
      setLastBackupAtIso(backupAtIso);
      setStorageError(null);
    } catch (nextError) {
      setStorageError(errorMessage(nextError));
    }
  }

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

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getStorageHealth(), getLastBackupAtIso()])
      .then(([nextHealth, backupAtIso]) => {
        if (cancelled) return;
        setStorageHealth(nextHealth);
        setLastBackupAtIso(backupAtIso);
        setStorageError(null);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setStorageError(errorMessage(nextError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function requestPersistence() {
    setStorageBusy(true);
    try {
      await requestStoragePersistence();
      await refreshStorage();
    } catch (nextError) {
      setStorageError(errorMessage(nextError));
    } finally {
      setStorageBusy(false);
    }
  }

  const storageCard = (
    <article className="shell-card settings-card settings-card--wide">
      <h2>Local storage</h2>
      {storageError && (
        <p role="alert" className="error-text">
          {storageError}
        </p>
      )}
      {!storageHealth ? (
        <p>Checking local storage…</p>
      ) : (
        <>
          <p>
            {storageHealth.opfsSupported
              ? 'Large assets use the browser file system.'
              : 'The browser file system is unavailable; assets use the IndexedDB fallback.'}
          </p>
          <dl className="settings-meta">
            <div>
              <dt>Usage</dt>
              <dd>
                {formatBytes(storageHealth.estimatedUsageBytes)} /{' '}
                {formatBytes(storageHealth.estimatedQuotaBytes)}
              </dd>
            </div>
            <div>
              <dt>Quota status</dt>
              <dd>
                {storageHealth.quotaWarning === 'near-limit'
                  ? 'Near limit'
                  : storageHealth.quotaWarning === 'unknown'
                    ? 'Estimate unavailable'
                    : 'Healthy'}
              </dd>
            </div>
            <div>
              <dt>Persistence</dt>
              <dd>{storageHealth.persistentGranted ? 'Granted' : 'Not granted'}</dd>
            </div>
            <div>
              <dt>Last full backup</dt>
              <dd>
                {lastBackupAtIso ? new Date(lastBackupAtIso).toLocaleString() : 'Not recorded'}
              </dd>
            </div>
          </dl>
          {!storageHealth.persistentGranted && (
            <button
              type="button"
              className="button button--ghost"
              disabled={storageBusy}
              onClick={() => void requestPersistence()}
            >
              {storageBusy ? 'Requesting…' : 'Keep local data on this device'}
            </button>
          )}
          {storageHealth.quotaWarning === 'near-limit' && (
            <p role="alert" className="error-text">
              Local storage is near its browser quota. Export a full backup before adding more
              media.
            </p>
          )}
        </>
      )}
    </article>
  );

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

  async function rotateSigningKey() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await companionRequest<{ keyId: string }>('/api/signing-keys/rotate', {
        method: 'POST',
      });
      setNotice(`Created signing key ${result.keyId}; the private key remains in the companion.`);
      await refresh();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function revokeSigningKey(keyId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await companionRequest(`/api/signing-keys/${encodeURIComponent(keyId)}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'revoked by owner' }),
      });
      setNotice(`Revoked signing key ${keyId}.`);
      await refresh();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <section className="shell-card" aria-labelledby="settings-title">
          <h1 id="settings-title">Companion settings</h1>
          <p>Checking the local companion…</p>
        </section>
        {storageCard}
      </>
    );
  }

  if (!capabilities || !owner) {
    return (
      <>
        <section className="shell-card" aria-labelledby="settings-title">
          <h1 id="settings-title">Companion settings</h1>
          <p role="alert" className="error-text">
            {error ?? 'The companion is unavailable.'}
          </p>
          <button type="button" className="button" onClick={() => void refresh()}>
            Retry connection
          </button>
        </section>
        {storageCard}
      </>
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

          <article className="shell-card settings-card settings-card--wide">
            <h2>Release signing keys</h2>
            <p>
              Private Ed25519 keys are encrypted by the companion and never returned to this
              browser.
            </p>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void rotateSigningKey()}
            >
              Rotate signing key
            </button>
            {settings?.signingKeys.length ? (
              <ul className="settings-key-list">
                {settings.signingKeys.map((key) => (
                  <li key={key.keyId}>
                    <code>{key.keyId}</code>
                    <span>{key.status}</span>
                    {key.status !== 'revoked' && (
                      <button
                        type="button"
                        className="button button--ghost"
                        disabled={busy}
                        onClick={() => void revokeSigningKey(key.keyId)}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No signing keys created.</p>
            )}
          </article>
        </div>
      )}

      {storageCard}
    </section>
  );
}
