import { expect, test } from '@playwright/test';

test('shared home route renders in browser', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GuideForge' })).toBeVisible();
  const project = testInfo.project.name;
  if (project === 'iphone') {
    // Phone width hides the desktop nav; the Menu control is the primary nav.
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
  } else {
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  }
});

test('navigation reaches the library route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Library' }).first().click();
  await expect(page.getByRole('heading', { name: 'Guide library' })).toBeVisible();
});

test('settings exposes local storage health in browser-only mode', async ({ page }, testInfo) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Local storage' })).toBeVisible();
  await expect(page.getByText(/Healthy|Estimate unavailable|Near limit/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('settings-local-storage.png'),
    fullPage: true,
  });
});
