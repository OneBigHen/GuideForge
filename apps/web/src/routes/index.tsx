import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <section className="shell-card" aria-labelledby="home-title">
      <h1 id="home-title">GuideForge</h1>
      <p>
        Local-first spatial work instructions. This shell is the shared route rendered by the
        browser and the Tauri desktop wrapper.
      </p>
      <nav aria-label="Primary">
        <Link to="/library" className="button">
          Open guide library
        </Link>
      </nav>
    </section>
  );
}
