import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  return (
    <button
      type="button"
      className="button button--ghost"
      onClick={() => setDark((v) => !v)}
      aria-pressed={dark}
    >
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
