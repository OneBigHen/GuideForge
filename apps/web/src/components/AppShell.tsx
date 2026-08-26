import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { detectCapabilities, type DeviceCapabilityProfile } from '../services/capabilities';
import { activateUpdate } from '../services/sw';
import { ThemeToggle } from './ThemeToggle';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [caps] = useState<DeviceCapabilityProfile>(() => detectCapabilities());
  const [updateReady, setUpdateReady] = useState(false);
  const [companion, setCompanion] = useState<'unknown' | 'offline' | 'online'>('unknown');

  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener('guideforge:update-ready', onUpdate);
    return () => window.removeEventListener('guideforge:update-ready', onUpdate);
  }, []);

  // Probe the companion once: the status pill must reflect reality, not a
  // hardcoded label (Phase 01 provider/fallback transparency).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);
    fetch('/api/health', { signal: controller.signal, credentials: 'include' })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        const isCompanion =
          body !== null &&
          typeof body === 'object' &&
          'companion' in body &&
          body.companion === true;
        if (!cancelled) setCompanion(res.ok && isCompanion ? 'online' : 'offline');
      })
      .catch(() => {
        if (!cancelled) setCompanion('offline');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span aria-hidden="true">⚒️</span>
          <strong>GuideForge</strong>
        </div>
        <nav className="app-header__nav" aria-label="Main">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: 'nav-link nav-link--active' }}
          >
            Home
          </Link>
          <Link
            to="/library"
            className="nav-link"
            activeProps={{ className: 'nav-link nav-link--active' }}
          >
            Owner library
          </Link>
          <Link
            to="/asset-manager"
            className="nav-link"
            activeProps={{ className: 'nav-link nav-link--active' }}
          >
            Owner assets
          </Link>
          <Link
            to="/jobs"
            className="nav-link"
            activeProps={{ className: 'nav-link nav-link--active' }}
          >
            Owner jobs
          </Link>
          <Link
            to="/settings"
            className="nav-link"
            activeProps={{ className: 'nav-link nav-link--active' }}
          >
            Owner settings
          </Link>
        </nav>
        <div className="app-header__actions">
          <ThemeToggle />
          <button
            type="button"
            className="button button--ghost"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            Menu
          </button>
        </div>
      </header>
      {menuOpen && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile">
          <Link to="/" onClick={() => setMenuOpen(false)}>
            Home
          </Link>
          <Link to="/library" onClick={() => setMenuOpen(false)}>
            Owner library
          </Link>
          <Link to="/asset-manager" onClick={() => setMenuOpen(false)}>
            Owner assets
          </Link>
          <Link to="/jobs" onClick={() => setMenuOpen(false)}>
            Owner jobs
          </Link>
          <Link to="/settings" onClick={() => setMenuOpen(false)}>
            Owner settings
          </Link>
        </nav>
      )}
      {updateReady && (
        <div className="update-banner" role="status">
          <span>A new version of GuideForge is ready.</span>
          <button
            type="button"
            className="button button--small"
            onClick={() => void activateUpdate()}
          >
            Reload now
          </button>
        </div>
      )}
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p className="status-row">
          <span className="status-pill" title="Local save state">
            <span className="status-dot status-dot--local" aria-hidden="true" />
            Saved locally
          </span>
          <span className="status-pill" title="Network sync state">
            <span
              className={`status-dot ${
                companion === 'online' ? 'status-dot--local' : 'status-dot--offline'
              }`}
              aria-hidden="true"
            />
            {companion === 'online'
              ? 'Companion connected'
              : companion === 'unknown'
                ? 'Probing companion…'
                : 'Browser-only mode — no companion'}
          </span>
          <span className="status-pill status-pill--caps">
            {caps.pointer.coarse ? 'touch' : 'pointer'} ·{' '}
            {caps.platform.standalonePwa ? 'PWA' : 'web'}
          </span>
        </p>
      </footer>
    </div>
  );
}
