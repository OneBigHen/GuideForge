import { expect, test } from '@playwright/test';

// Full vertical slice: create → author a task + step + warning → generate
// proposals → accept one → run the guide and capture evidence.
test('author, propose, accept, and execute a guide', async ({ page }) => {
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('End-to-end slice');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible({ timeout: 5000 });

  // Add a task
  await page.getByPlaceholder('New task').fill('Task one');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Task one', exact: true })).toBeVisible();

  // Add a step (selects task, adds step)
  await page.getByRole('button', { name: 'Add step' }).click();
  await expect(page.getByRole('textbox', { name: 'Instruction' })).toBeVisible();

  // Write instruction text
  const instruction = page.getByRole('textbox', { name: 'Instruction' });
  await instruction.fill('Loosen the retaining screw with a 5 mm hex key.');
  await instruction.blur();

  // Add a warning
  await page.getByPlaceholder('Add a warning').fill('Disconnect power first');
  await page.getByRole('region', { name: 'Warnings' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Disconnect power first')).toBeVisible();

  // Generate proposals
  await page.getByRole('button', { name: 'Generate AI proposals' }).click();
  await expect(page.getByRole('heading', { name: 'AI proposals' })).toBeVisible();

  // Accept one proposal deterministically: its card disappears (2 → 1).
  await page.getByRole('button', { name: 'Accept' }).first().click();
  await expect
    .poll(async () => page.getByRole('button', { name: 'Accept' }).count(), { timeout: 8000 })
    .toBe(1);

  // Run the guide
  await page.getByRole('link', { name: '← Library' }).click();
  await page.getByRole('link', { name: 'Run' }).first().click();
  await expect(page.getByText(/Loosen the retaining screw/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Disconnect power first')).toBeVisible();

  // Capture evidence
  await page.getByRole('button', { name: /Capture photo evidence/ }).click();
  await expect(page.getByText('photo', { exact: true })).toBeVisible();
});
