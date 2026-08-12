import { expect, test } from '@playwright/test';

test('cold GuideForge shell stays within the 5s p95 startup budget', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Run the cold-shell benchmark once.');
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const started = Date.now();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Project readiness' })).toBeVisible();
    samples.push(Date.now() - started);
    await context.close();
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.log(`cold-shell samples=${samples.join(',')}ms p95=${p95}ms`);
  expect(p95).toBeLessThan(5_000);
});
