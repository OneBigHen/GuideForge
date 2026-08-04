import { expect, test } from '@playwright/test';

test('shared home route renders in browser', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GuideForge' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('navigation reaches the library route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Library' }).first().click();
  await expect(page.getByRole('heading', { name: 'Guide library' })).toBeVisible();
});
