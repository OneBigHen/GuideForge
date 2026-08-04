import { expect, test } from '@playwright/test';

// Phase 03 offline acceptance: after a first online load (precache), the app
// shell must open without network. We simulate by disabling the network after
// the service worker has installed and cached the shell.
//
// WebKit's Playwright driver cannot navigate while offline (internal error),
// so this test runs on Chromium projects only; the offline shell logic is
// engine-independent (Workbox precache + navigation fallback).
test('app shell opens without network after first load', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.use.defaultBrowserType === 'webkit', 'WebKit cannot navigate offline');
  // First load online so the service worker precaches the shell.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GuideForge' })).toBeVisible();

  // Wait for the service worker to control the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForTimeout(500);

  // Disable all network requests; the shell must still render from cache.
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GuideForge' })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('link', { name: 'Library', exact: true })).toBeVisible();
});
