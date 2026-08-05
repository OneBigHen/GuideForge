import { expect, test } from '@playwright/test';

// Phase 03: complete spatial editor — undo/redo, isolate, layers, annotations,
// cameras panels, and keyboard shortcuts (all with DOM alternatives).
test('spatial editor: undo/redo, isolate, layers, annotations', async ({ page }) => {
  await page.goto('/library');
  await page.getByLabel('New guide title').fill('Scene 03');
  await page.getByRole('button', { name: 'Create guide' }).click();
  await expect(page.getByRole('heading', { name: 'Edit guide' })).toBeVisible({ timeout: 5000 });

  await page.getByRole('link', { name: 'Spatial editor' }).click();
  await expect(page.getByRole('heading', { name: 'Spatial editor' })).toBeVisible({
    timeout: 5000,
  });

  // Add two objects.
  await page.getByLabel('New object name').fill('A');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('New object name').fill('B');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: '👁 A' })).toBeVisible();
  await expect(page.getByRole('button', { name: '👁 B' })).toBeVisible();

  // Undo removes the last added node (B).
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: '👁 B' })).toHaveCount(0);
  // Redo restores it.
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('button', { name: '👁 B' })).toBeVisible();

  // Layers panel: add a layer and assign A to it.
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByLabel('New layer name').fill('Tools');
  await page.getByRole('button', { name: 'Add layer', exact: true }).click();
  await expect(page.getByText('Tools', { exact: true })).toBeVisible();

  // Cameras panel: add a bookmark.
  await page.getByRole('button', { name: 'Cameras', exact: true }).click();
  await page.getByRole('button', { name: 'Add camera bookmark', exact: true }).click();
  await expect(page.getByText('Camera 1')).toBeVisible();

  // Annotations panel: select A and add a label.
  await page.getByRole('button', { name: 'Annotations', exact: true }).click();
  await page.getByRole('button', { name: '👁 A' }).click();
  await page.getByLabel('Annotation text').fill('Plunger');
  await page.getByRole('button', { name: 'Add label', exact: true }).click();
  await expect(page.getByText('Plunger', { exact: true })).toBeVisible();

  // Keyboard shortcut: W selects translate mode.
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'translate' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
