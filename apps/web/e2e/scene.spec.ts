import { expect, test } from '@playwright/test';

// Spatial editor vertical slice: create a guide, open the scene editor, add an
// object, select it, edit numeric position (non-drag alternative), and verify
// the DOM hierarchy alternative reflects changes.
test('spatial editor: hierarchy, selection, and numeric transforms', async ({ page }) => {
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Scene slice');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible({ timeout: 5000 });

  // Open the spatial editor
  await page.getByRole('link', { name: 'Spatial editor' }).click();
  await expect(page.getByRole('heading', { name: 'Spatial editor' })).toBeVisible({
    timeout: 5000,
  });

  // Add an object
  await page.getByLabel('New object name').fill('Widget');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: '👁 Widget' })).toBeVisible();

  // It should be selected (shows in inspector)
  await expect(page.getByText('Widget', { exact: true }).first()).toBeVisible();

  // Numeric transform (non-drag alternative): set position X
  const positionInputs = page.locator('fieldset').filter({ hasText: 'Position' }).locator('input');
  const xInput = positionInputs.nth(0);
  await xInput.fill('2.5');
  await xInput.blur();

  // Hierarchy is the DOM alternative to the 3D scene; verify node persists.
  await expect(page.getByRole('button', { name: '👁 Widget' })).toHaveCount(1);
});
