import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export completion report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-completion\.json$/);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('completion report download has no local path');
  const report = JSON.parse(await readFile(downloadPath, 'utf8')) as {
    status: string;
    completedSteps: number;
    totalSteps: number;
    steps: {
      stepId: string;
      completed: boolean;
      completion: { evidenceIds: string[] } | null;
    }[];
    evidence: {
      evidenceId: string;
      stepId: string;
      kind: string;
      assetHash?: string;
      attestation?: { signatureHex: string };
      value?: string;
    }[];
  };
  expect(report).toMatchObject({ status: 'completed', completedSteps: 2, totalSteps: 2 });
  expect(report.evidence.map((item) => item.kind)).toEqual(
    expect.arrayContaining(['photo', 'signature', 'note']),
  );
  expect(report.steps).toHaveLength(2);
  const evidenceById = new Map(report.evidence.map((item) => [item.evidenceId, item]));
  for (const step of report.steps) {
    expect(step.completed).toBe(true);
    expect(step.completion?.evidenceIds.length).toBeGreaterThan(0);
    for (const evidenceId of step.completion?.evidenceIds ?? []) {
      expect(evidenceById.get(evidenceId)?.stepId).toBe(step.stepId);
    }
  }
  expect(report.evidence.find((item) => item.kind === 'photo')?.assetHash).toMatch(/^[0-9a-f]{64}$/);
  expect(report.evidence.find((item) => item.kind === 'signature')?.attestation?.signatureHex).toMatch(
    /^[0-9a-f]+$/,
  );
  expect(report.evidence.find((item) => item.kind === 'note')?.value).toBe(
    'Pressure recorded locally.',
  );
  await expect(page.getByText(/Completion report exported/)).toBeVisible();
});
