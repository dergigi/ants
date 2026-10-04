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

test('profile URL applies implicit scope to every OR branch', async ({ page }) => {
  const npub = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
  await page.goto(`/p/${npub}?q=${encodeURIComponent('bitcoin OR nostr')}`);
  const preview = page.locator('#search-explanation');
  await expect(preview).toContainText(`bitcoin by:${npub}`);
  await expect(preview).toContainText(`nostr by:${npub}`);
});

test('profile URL preserves mixed-author branch constraints', async ({ page }) => {
  const npub = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
  const other = 'a'.repeat(64);
  const query = `bitcoin by:${npub} OR nostr by:${other}`;
  await page.goto(`/p/${npub}?q=${encodeURIComponent(query)}`);
  const input = page.locator('#search-row input[type="text"]');
  await expect(input).toHaveValue(query);
  await input.press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(query);
  await page.reload();
  await expect(input).toHaveValue(query);
});
