import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

async function renderShell() {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <p>content</p>
      </AppShell>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([indexRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('app shell', () => {
  it('renders brand and main navigation', async () => {
    await renderShell();
    expect(screen.getByText('GuideForge')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Library' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
  });
});
