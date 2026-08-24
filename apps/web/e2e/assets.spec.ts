import { generateProceduralGlb } from '@guideforge/assets';
import { expect, test } from '@playwright/test';

test('asset manager imports safe GLB bytes and plans provider searches', async ({ page }) => {
  await page.goto('/assets');
  await expect(page.getByRole('heading', { name: 'Asset manager' })).toBeVisible();

  await page.getByLabel('Import model').setInputFiles({
    name: 'pipette.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(generateProceduralGlb('simple-pipette')),
  });
  await expect(page.getByRole('status')).toContainText('Safe self-contained model imported');
  await expect(page.getByRole('heading', { name: 'pipette.glb' })).toBeVisible();
  await expect(page.getByText('12 triangles · 8 vertices')).toBeVisible();

  await page.getByPlaceholder('micropipette, valve, filter…').fill('micropipette');
  await page.getByRole('button', { name: 'Search providers' }).click();
  await expect(page.getByRole('heading', { name: 'Provider search requests' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Poly Haven' })).toHaveAttribute(
    'href',
    /q=micropipette/,
  );
});

test('asset manager creates a local procedural template', async ({ page }) => {
  await page.goto('/assets');
  await page.getByRole('button', { name: 'simple-pipette' }).click();
  await expect(page.getByRole('status')).toContainText('Local CC0 procedural asset added');
  await expect(page.getByRole('heading', { name: 'Pipette (simple)' })).toBeVisible();
});
