import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { routeTree } from './routeTree.gen';
import { registerServiceWorker } from './services/sw';
import { trackRoute } from './services/telemetry';
import './styles.css';

registerServiceWorker();

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 30_000,
});

// Privacy-reviewed route telemetry: path only, ids stripped inside telemetry.
router.subscribe('onResolved', () => {
  trackRoute(router.state.location.pathname);
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
