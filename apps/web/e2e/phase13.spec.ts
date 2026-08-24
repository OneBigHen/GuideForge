import { expect, test } from '@playwright/test';

test('project readiness dashboard and job center are usable on the supported profiles', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Project readiness' })).toBeVisible();
  await expect(page.getByText('Local-first workspace')).toBeVisible();
  await expect(page.getByText('Local storage', { exact: true })).toBeVisible();

  const controls = page.locator('.button:visible');
  const heights = await controls.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().height)),
  );
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);

  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: 'Job center' })).toBeVisible();
  await expect(page.getByText(/provider execution and cloud cost are not hidden/)).toBeVisible();
  await expect(page.getByText('No local jobs yet.')).toBeVisible();
});

test('phone navigation exposes the job center through the menu', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'The desktop and tablet nav already show Jobs.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Jobs' }),
  ).toBeVisible();
});

test('library offers a real full-backup download', async ({ page }) => {
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Phase 13 backup');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible();
  await page.getByRole('link', { name: '← Library' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-backup\.gforge$/);
});
