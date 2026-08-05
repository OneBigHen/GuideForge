import { expect, test } from '@playwright/test';

// Phase 07: signed release export produces a downloadable .gforge with a
// public key note, and .guide import is available in the library.
test('export a signed release from the editor', async ({ page }) => {
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Release slice');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible({ timeout: 5000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export release' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.gforge');

  await expect(page.locator('.release-note')).toContainText('signed release', { timeout: 5000 });
});

test('library offers .guide import', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Guide library' })).toBeVisible();
  await expect(page.getByText('Import .guide')).toBeVisible();
});
