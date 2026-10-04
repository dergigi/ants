import { expect, test } from '@playwright/test';

test('previews nested groups and preserves quoted operators', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('#search-row input[type="text"]');
  await input.fill('(bitcoin OR (nostr AND lightning)) by:(alice OR bob)');
  const preview = page.locator('#search-explanation');
  await expect(preview).toContainText('bitcoin by:alice,bob');
  await expect(preview).toContainText('nostr lightning by:alice,bob');
  await input.fill('"(cats OR dogs)"');
  await expect(preview).toContainText('"(cats OR dogs)"');
  await expect(preview).not.toHaveAttribute('role', 'alert');
});

test('reports incomplete input and excessive expansion', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('#search-row input[type="text"]');
  const preview = page.locator('#search-explanation');
  await input.fill('by:(alice OR)');
  await expect(preview).toHaveAttribute('role', 'alert');
  await expect(preview).toContainText('character');
  await input.press('Enter');
  await expect(page.locator('#search-row .animate-spin')).toHaveCount(0);
  await input.fill(Array.from({ length: 6 }, (_, i) => `(a${i} OR b${i})`).join(' '));
  await expect(preview).toContainText('32 branches');
});
