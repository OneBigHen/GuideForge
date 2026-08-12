import { expect, test } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('completes, resumes offline, and exports a multi-step procedure report', async ({
  page,
  context,
}, testInfo) => {
  const webkit = testInfo.project.use.defaultBrowserType === 'webkit';

  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Offline procedure acceptance');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible();

  await page.getByPlaceholder('New task').fill('Procedure');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('textbox', { name: 'Instruction' }).fill('Inspect the housing.');
  await page.getByRole('textbox', { name: 'Instruction' }).blur();
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('textbox', { name: 'Instruction' }).fill('Record the operating pressure.');
  await page.getByRole('textbox', { name: 'Instruction' }).blur();

  await page.getByRole('link', { name: '← Library' }).click();
  await page.getByRole('link', { name: 'Run' }).first().click();
  await expect(page.getByText('Inspect the housing.', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });

  await page.getByLabel('Procedure photo input').setInputFiles({
    name: 'inspection.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
  await expect(page.getByText(/photo:/)).toBeVisible();
  await page.getByRole('button', { name: 'Create attestation' }).click();
  await expect(page.getByText(/signature:/)).toBeVisible();
  await page.getByRole('button', { name: 'Complete step →' }).click();
  await expect(page.getByText('Record the operating pressure.', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('Offline · changes save on this device')).toBeVisible();
  await page.getByLabel('Note').fill('Pressure recorded locally.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByRole('button', { name: 'Complete step →' }).click();
  await expect(page.getByRole('heading', { name: 'Procedure complete' })).toBeVisible();

  // WebKit's Playwright driver cannot navigate while offline. It still covers
  // the same capture/completion/resume UI; Chromium covers the service-worker
  // reload while offline.
  if (webkit) await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Procedure complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Export completion report' }).click();
  await expect(page.getByText(/Completion report exported/)).toBeVisible();
});
