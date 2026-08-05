import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Phase 08 WCAG 2.2 AA scan across the main routes (non-XR workflows).
for (const route of ['/', '/library']) {
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
