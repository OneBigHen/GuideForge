import { expect, test } from '@playwright/test';

test('training studio generates and reviews a source-grounded program', async ({ page }) => {
  const instruction = 'Disconnect power before opening the housing.';

  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Training slice');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible({ timeout: 5000 });

  await page.getByPlaceholder('New task').fill('Safe setup');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  const stepEditor = page.getByRole('textbox', { name: 'Instruction' });
  await stepEditor.fill(instruction);
  await stepEditor.blur();

  await page.getByRole('link', { name: 'Source Studio' }).click();
  await expect(page.getByRole('heading', { name: 'Source Studio' })).toBeVisible();
  await page.getByLabel('Choose source files').setInputFiles({
    name: 'procedure.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(instruction),
  });
  await expect(page.getByRole('button', { name: 'procedure.txt' })).toBeVisible({ timeout: 8000 });

  await page.getByRole('link', { name: 'Back to editor' }).click();
  await page.getByRole('link', { name: 'Training studio' }).click();
  await expect(page.getByRole('heading', { name: 'Training studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Generate from procedure' }).click();

  await expect(page.getByText('Ready for owner review.')).toBeVisible({ timeout: 8000 });
  await expect(page.getByLabel('Training quality report').getByText('1 objectives')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Item bank and review' })).toBeVisible();
  const target = page.getByLabel('Target');
  await target.fill('the documented safe setup');
  await target.blur();
  const prompt = page.getByLabel('Prompt');
  await prompt.fill('Which documented action comes first?');
  await prompt.blur();
  await expect(prompt).toHaveValue('Which documented action comes first?');
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.getByLabel('Training quality report').getByText('1 reviewed')).toBeVisible();
});
