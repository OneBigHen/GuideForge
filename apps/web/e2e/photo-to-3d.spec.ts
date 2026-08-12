import { expect, test } from '@playwright/test';

function pngFixture(): Buffer {
  const chunk = (type: string, data: number[]): number[] => {
    const bytes = new Uint8Array(12 + data.length);
    new DataView(bytes.buffer).setUint32(0, data.length, false);
    bytes.set(new TextEncoder().encode(type), 4);
    bytes.set(data, 8);
    return Array.from(bytes);
  };
  return Buffer.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk('IHDR', [0, 0, 3, 32, 0, 0, 3, 32, 8, 6, 0, 0, 0]),
    ...chunk('eXIf', [1, 2, 3]),
    ...chunk('IEND', []),
  ]);
}

test('photo-to-3D wizard sanitizes views and fails closed without supported GPU', async ({
  page,
}) => {
  await page.goto('/photo-to-3d');
  await expect(page.getByRole('heading', { name: 'Photo to 3D' })).toBeVisible();

  const bytes = pngFixture();
  await page.locator('input[aria-label="Choose photos"]').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: bytes },
    { name: 'side.png', mimeType: 'image/png', buffer: bytes },
    { name: 'back.png', mimeType: 'image/png', buffer: bytes },
  ]);
  await expect(page.getByText('3 views selected; quality checks run when queued.')).toBeVisible();

  await page.getByPlaceholder('micropipette, valve, pump…').fill('micropipette');
  await page.getByRole('button', { name: 'Search local library first' }).click();
  await expect(page.getByRole('link', { name: 'Review provider search' })).toBeVisible();

  await page.getByRole('button', { name: 'Queue local shape draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Queued but blocked' })).toBeVisible();
  await expect(
    page.getByLabel('Job center').getByText(/requires a supported local GPU/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/cancelled · tripo-sr · cpu/)).toBeVisible();
});
