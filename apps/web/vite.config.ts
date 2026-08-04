import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import workboxBuild from 'workbox-build';

interface WorkboxBuildApi {
  generateSW: (opts: Record<string, unknown>) => Promise<{ count: number; size: number }>;
}
const { generateSW } = workboxBuild as unknown as WorkboxBuildApi;

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: false }),
    react(),
    {
      name: 'guideforge-workbox',
      async closeBundle() {
        const dir = import.meta.dirname;
        await generateSW({
          swDest: resolve(dir, 'dist/sw.js'),
          globDirectory: resolve(dir, 'dist'),
          globPatterns: ['**/*.{js,css,html,woff2}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          skipWaiting: false,
          clientsClaim: true,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/assets\//],
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: true,
  },
  clearScreen: false,
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
