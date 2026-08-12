import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Phase 13 WCAG 2.2 AA scan across the main routes (non-XR workflows).
for (const route of ['/', '/library', '/jobs', '/settings']) {
  test(`WCAG 2.2 scan: ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);
  });
}

test('WCAG 2.2 scan: editor after creating a guide', async ({ page }) => {
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('A11y guide');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible({ timeout: 5000 });
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
  ).toEqual([]);
});

test('WCAG 2.2 scan: procedure player', async ({ page }) => {
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('A11y procedure');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await page.getByPlaceholder('New task').fill('Procedure');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('textbox', { name: 'Instruction' }).fill('Inspect the housing.');
  await page.getByRole('textbox', { name: 'Instruction' }).blur();
  await page.getByRole('link', { name: '← Library' }).click();
  await page.getByRole('link', { name: 'Run' }).first().click();
  await expect(page.getByText('Inspect the housing.', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
  ).toEqual([]);
});
