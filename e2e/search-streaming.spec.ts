import { test, expect } from '@playwright/test';

const RESULT_CARD = '[class*="bg-[#2d2d2d]"]';

test.describe('Search result stability (issue #165)', () => {

  test('search for "nostr" returns visible results', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(5000);

    const searchInput = page.locator('input').first();
    await searchInput.fill('nostr');
    await searchInput.press('Enter');

    await expect(page.locator(RESULT_CARD).first()).toBeVisible({ timeout: 45_000 });
    const count = await page.locator(RESULT_CARD).count();
    expect(count).toBeGreaterThan(0);
  });

  test('results do not disappear after initially appearing', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(5000);

    const searchInput = page.locator('input').first();
    await searchInput.fill('bitcoin');
    await searchInput.press('Enter');

    await expect(page.locator(RESULT_CARD).first()).toBeVisible({ timeout: 45_000 });

    let minCount = Infinity;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const count = await page.locator(RESULT_CARD).count();
      if (count < minCount) minCount = count;
    }

    expect(minCount).toBeGreaterThan(0);
  });

  test('search triggers automatically from query param', async ({ page }) => {
    await page.goto('/?q=nostr');

    await expect(page.locator(RESULT_CARD).first()).toBeVisible({ timeout: 45_000 });
    const count = await page.locator(RESULT_CARD).count();
    expect(count).toBeGreaterThan(0);
  });
});
