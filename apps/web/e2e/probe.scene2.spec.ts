import { test } from '@playwright/test';
test('probe scene2', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Scene probe2');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await page.getByRole('heading', { name: 'Edit guide' }).waitFor();
  await page.getByRole('link', { name: 'Spatial editor' }).click();
  await page.waitForTimeout(3000);
  console.log('LOGS:', JSON.stringify(logs, null, 1).slice(0, 1200));
});
