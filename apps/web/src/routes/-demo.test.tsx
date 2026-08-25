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
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { DEMO_GUIDE_ID } from '../demo/get-to-know-andrew';
import { Route as DemoRoute } from './demo';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

function history() {
  return createMemoryHistory({ initialEntries: ['/demo'] });
}

let routerHistory: ReturnType<typeof history> | undefined;

function renderDemo(): void {
  const rootRoute = createRootRoute({ component: Outlet });
  const attached = DemoRoute.update({
    id: '/demo',
    path: '/demo',
    getParentRoute: () => rootRoute,
  } as never);
  const router = createRouter({
    routeTree: rootRoute.addChildren([attached]),
    history: (routerHistory = history()),
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
});

describe('public demo landing page', () => {
  it('shows proof points and no admin/settings controls', async () => {
    renderDemo();
    expect(await screen.findByRole('heading', { name: /GuideForge turns source documents/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Launch demo' })).toBeTruthy();
    expect(screen.queryByText(/settings/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /library/i })).toBeNull();
  });

  it('seeds assets + demo guide and navigates to the run view on launch', async () => {
    await Dexie.delete('guideforge');
    await Dexie.delete(DEMO_GUIDE_ID);
    renderDemo();
    (await screen.findByRole('button', { name: 'Launch demo' })).click();
    await waitFor(
      () => {
        expect(routerHistory?.location.pathname).toBe(`/run/${DEMO_GUIDE_ID}`);
      },
      { timeout: 20_000 },
    );
  }, 30_000);

  it('requires explicit confirmation before erasing local demo data', async () => {
    renderDemo();
    const reset = await screen.findByRole('button', { name: 'Reset local demo data' });
    reset.click();
    // First click only asks; no data is erased yet.
    expect(
      await screen.findByRole('button', { name: 'Really erase local demo data?' }),
    ).toBeTruthy();
  });
});
