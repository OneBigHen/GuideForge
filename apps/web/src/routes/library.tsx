import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/library')({
  component: LibraryPage,
});

function LibraryPage() {
  return (
    <section className="shell-card" aria-labelledby="library-title">
      <h1 id="library-title">Guide library</h1>
      <p>The local guide library will be implemented in Phase 02.</p>
    </section>
  );
}
