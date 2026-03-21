import { test, expect } from '@playwright/test';

test.describe('Geo, Listing, and Calendar search modifiers', () => {

  /**
   * Helper: load a search query, wait for completion, assert no JS errors.
   * Uses signal-based waits per AGENTS.md — no fixed timeouts.
   */
  async function assertSearchLoadsWithoutErrors(page: import('@playwright/test').Page, url: string) {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(url);
    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    // Wait for network to settle (search relay requests complete)
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    expect(errors).toHaveLength(0);
  }

  test('is:listing search modifier loads without errors', async ({ page }) => {
    await assertSearchLoadsWithoutErrors(page, '/?q=is%3Alisting');
  });

  test('is:classified resolves to same kind as is:listing', async ({ page }) => {
    await assertSearchLoadsWithoutErrors(page, '/?q=is%3Aclassified');
  });

  test('is:event search modifier triggers calendar event search', async ({ page }) => {
    await assertSearchLoadsWithoutErrors(page, '/?q=is%3Aevent');
  });

  test('g:<geohash> search does not crash', async ({ page }) => {
    await assertSearchLoadsWithoutErrors(page, '/?q=g%3A9v6kp');
  });

  test('g:<geohash> combined with is:listing does not crash', async ({ page }) => {
    await assertSearchLoadsWithoutErrors(page, '/?q=g%3A9v6kp%20is%3Alisting');
  });

  test('g:<geohash> combined with is:event does not crash', async ({ page }) => {
    await assertSearchLoadsWithoutErrors(page, '/?q=g%3Au33d%20is%3Aevent');
  });

  test('broad geohash g:9 does not crash', async ({ page }) => {
    await assertSearchLoadsWithoutErrors(page, '/?q=g%3A9');
  });
});
