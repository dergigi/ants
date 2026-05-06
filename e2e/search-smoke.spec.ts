import { expect, test } from '@playwright/test';
import { searchExamples } from '../src/lib/examples';

const smokeQueries = [
  { label: 'basic text search', query: 'vibe coding' },
  { label: 'author search', query: 'by:fiatjaf' },
  { label: 'profile search', query: 'p:fiatjaf' },
  { label: 'text plus author search', query: 'GM by:dergigi' },
  { label: 'site plus author search', query: 'site:github by:fiatjaf' },
] as const;

const exampleSet = new Set(searchExamples);

for (const { query } of smokeQueries) {
  if (!exampleSet.has(query)) {
    throw new Error(`Missing smoke query in src/lib/examples.ts: ${query}`);
  }
}

test.describe('real relay search smoke', () => {
  test.describe.configure({ mode: 'serial' });

  for (const { label, query } of smokeQueries) {
    test(`${label}: ${query}`, async ({ page }) => {
      test.setTimeout(90_000);

      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      await page.goto('/');

      const input = page.locator('#search-row input[type="text"]');
      await expect(input).toBeVisible();

      await input.fill(query);
      await input.press('Enter');

      await expect
        .poll(() => new URL(page.url()).searchParams.get('q'))
        .toBe(query);

      const spinner = page.locator('#search-row .animate-spin');
      await spinner.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null);
      await expect(spinner).toHaveCount(0, { timeout: 45_000 });

      await expect(input).toHaveValue(query);

      const followUpQuery = `${query} again`;
      await input.fill(followUpQuery);
      await expect(input).toHaveValue(followUpQuery);

      expect(pageErrors).toEqual([]);
    });
  }
});
