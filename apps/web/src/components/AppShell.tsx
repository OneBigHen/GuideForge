import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

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
            Library
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
            Library
          </Link>
        </nav>
      )}
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p>
          Local save status:{' '}
          <span className="status-dot status-dot--local" aria-label="local only" /> not yet
          connected
        </p>
      </footer>
    </div>
  );
}
