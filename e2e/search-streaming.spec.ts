import { test, expect } from '@playwright/test';

/**
 * E2E regression tests for search streaming result stability.
 *
 * Bug (issue #165): The streaming callback in SearchView discarded final
 * results once any intermediate streaming batch had fired, and the onResults
 * callback ignored the `isComplete` parameter. This caused:
 *   - Search returning no results or unrelated results
 *   - Results flickering / disappearing after initial display
 *   - Search not triggering on page load with query params
 */

const RESULT_CARD = '[data-testid="search-result-card"]';

test.describe('Search result stability (issue #165)', () => {

  test('search for "nostr" returns visible results', async ({ page }) => {
    await page.goto('/');

    // Wait for relay connections to establish
    await page.waitForTimeout(5000);

    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('nostr');
    await searchInput.press('Enter');

    // Results should appear within the streaming timeout window
    await expect(page.locator(RESULT_CARD).first()).toBeVisible({ timeout: 45_000 });

    const count = await page.locator(RESULT_CARD).count();
    expect(count).toBeGreaterThan(0);
  });

  test('results do not disappear after initially appearing', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(5000);

    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('bitcoin');
    await searchInput.press('Enter');

    // Wait for first results
    await expect(page.locator(RESULT_CARD).first()).toBeVisible({ timeout: 45_000 });

    // Sample result count over 10 seconds — count should never drop to zero
    let minCount = Infinity;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const count = await page.locator(RESULT_CARD).count();
      if (count < minCount) minCount = count;
    }

    // Core assertion: results must never vanish after first appearing
    expect(minCount).toBeGreaterThan(0);
  });

  test('search triggers automatically from query param', async ({ page }) => {
    // Navigate directly with a query param — search should auto-trigger
    await page.goto('/?q=nostr');

    // Results should appear without any user interaction
    await expect(page.locator(RESULT_CARD).first()).toBeVisible({ timeout: 45_000 });

    const count = await page.locator(RESULT_CARD).count();
    expect(count).toBeGreaterThan(0);
  });
});
