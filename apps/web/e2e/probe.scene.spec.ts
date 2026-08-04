import { test } from '@playwright/test';
test('probe scene', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Scene probe');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await page.getByRole('heading', { name: 'Edit guide' }).waitFor();
  await page.getByRole('link', { name: 'Spatial editor' }).click();
  await page.waitForTimeout(2500);
  console.log('URL:', page.url());
  console.log('BODY:', (await page.locator('body').innerText()).slice(0, 400));
  console.log('ERRORS:', JSON.stringify(errs));
});
