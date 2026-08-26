import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Route as AssetsRoute } from './asset-manager';

function renderAssetsAt(opts: { secureContext: boolean; hasSubtle: boolean }): void {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: opts.secureContext,
  });
  const subtle = opts.hasSubtle
    ? { digest: () => Promise.resolve(new ArrayBuffer(32)) }
    : undefined;
  const randomUUID = opts.secureContext && opts.hasSubtle ? () => 'u' : undefined;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: () => new Uint8Array(1), subtle, randomUUID },
  });

  const rootRoute = createRootRoute({ component: Outlet });
  const attached = AssetsRoute.update({
    // Mirror the generated route tree wiring (routeTree.gen.ts).
    id: '/asset-manager',
    path: '/asset-manager',
    getParentRoute: () => rootRoute,
  } as never);
  const router = createRouter({
    routeTree: rootRoute.addChildren([attached]),
    history: createMemoryHistory({ initialEntries: ['/asset-manager'] }),
  });
  void router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { isSecureContext?: boolean }).isSecureContext;
});

describe('asset manager page', () => {
  it('renders an actionable secure-context message on insecure LAN HTTP origins', async () => {
    renderAssetsAt({ secureContext: false, hasSubtle: false });
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('HTTPS');
    });
    expect(screen.getByRole('alert').textContent).toContain('localhost');
    // The page itself must still render — no crash replacing the app.
    expect(screen.getByRole('heading', { name: 'Asset manager' })).toBeTruthy();
    expect(screen.getByText(/blocked on this origin/)).toBeTruthy();
  }, 15_000);

  it('reports ready storage status in a capable environment', async () => {
    renderAssetsAt({ secureContext: true, hasSubtle: true });
    await waitFor(() => {
      expect(screen.getByText(/ready/)).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  }, 15_000);
});
