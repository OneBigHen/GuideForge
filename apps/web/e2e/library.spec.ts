import { expect, test } from '@playwright/test';

test('library creates and opens a guide', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Guide library' })).toBeVisible();

  await page.getByLabel('New guide title').fill('Playwright draft');
  await page.getByRole('button', { name: 'Create guide' }).click();

  // Navigation to edit page via hash route (we set window.location.hash).
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel('Title')).toHaveValue('Playwright draft');
});
