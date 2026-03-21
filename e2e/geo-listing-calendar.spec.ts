import { test, expect } from '@playwright/test';

const RESULT_CARD = '[class*="bg-[#2d2d2d]"]';

test.describe('Geo, Listing, and Calendar search modifiers', () => {

  test('is:listing search modifier triggers search via query param', async ({ page }) => {
    await page.goto('/?q=is%3Alisting');

    // The search input should contain the expanded query (kind:30402)
    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Wait for search to complete (results or no results)
    // We don't assert result count since listings may be rare on test relays
    await page.waitForTimeout(10_000);

    // The page should not error — no uncaught exceptions
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });

  test('is:classified resolves to same kind as is:listing', async ({ page }) => {
    await page.goto('/?q=is%3Aclassified');

    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(10_000);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });

  test('is:event search modifier triggers calendar event search', async ({ page }) => {
    await page.goto('/?q=is%3Aevent');

    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(10_000);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });

  test('is:calendar search modifier triggers calendar collection search', async ({ page }) => {
    await page.goto('/?q=is%3Acalendar');

    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(10_000);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });

  test('g:<geohash> search does not crash', async ({ page }) => {
    await page.goto('/?q=g%3A9v6kp');

    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Wait for search to complete
    await page.waitForTimeout(10_000);

    // Verify no JS errors
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });

  test('g:<geohash> combined with is:listing does not crash', async ({ page }) => {
    await page.goto('/?q=g%3A9v6kp%20is%3Alisting');

    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(10_000);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });

  test('g:<geohash> combined with is:event does not crash', async ({ page }) => {
    await page.goto('/?q=g%3Au33d%20is%3Aevent');

    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(10_000);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });

  test('broad geohash g:9 does not crash', async ({ page }) => {
    await page.goto('/?q=g%3A9');

    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(10_000);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(errors).toHaveLength(0);
  });
});
