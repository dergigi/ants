import { expect, test, type Page } from '@playwright/test';
import { searchExamples, type SearchExample } from '../src/lib/examples';

type SmokeQuery = {
  label: string;
  query: SearchExample;
  resultType: 'event' | 'profile';
  expectedText?: string;
  expectedResolvedAuthor?: string;
};

const fiatjafAuthor = 'by:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';
const socratesAuthor = 'by:npub1s0cra5735s8ccw7pfvqtp4see7t7lkfr0gwrfhkhsfakuxkf5ahs83023h';
const dergigiAuthor = 'by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';

const smokeQueries: readonly SmokeQuery[] = [
  { label: 'basic text search', query: 'vibe coding', resultType: 'event' },
  {
    label: 'author search',
    query: 'by:fiatjaf',
    resultType: 'event',
    expectedResolvedAuthor: fiatjafAuthor,
  },
  { label: 'profile search', query: 'p:fiatjaf', resultType: 'profile' },
  {
    label: 'text plus author search',
    query: 'good by:socrates',
    resultType: 'event',
    expectedText: 'good',
    expectedResolvedAuthor: socratesAuthor,
  },
  { label: 'site plus author search', query: 'site:github by:fiatjaf', resultType: 'event' },
  {
    label: 'second author search',
    query: 'by:socrates',
    resultType: 'event',
    expectedResolvedAuthor: socratesAuthor,
  },
  { label: 'second profile search', query: 'p:hodl', resultType: 'profile' },
  { label: 'media search', query: 'has:image', resultType: 'event' },
  {
    label: 'author plus media search',
    query: 'by:dergigi has:image',
    resultType: 'event',
    expectedResolvedAuthor: dergigiAuthor,
  },
  { label: 'OR search', query: 'bitcoin OR lightning', resultType: 'event' },
];

const exampleSet = new Set(searchExamples);
const baseCardSelector = '[class*="relative"][class*="bg-[#2d2d2d]"][class*="border-[#3d3d3d]"]';
const eventCardSelector = `${baseCardSelector}:not([class*="overflow-hidden"])`;
const profileCardSelector = `${baseCardSelector}[class*="overflow-hidden"]`;

const getResultCards = (page: Page, resultType: 'event' | 'profile') =>
  page.locator(resultType === 'profile' ? profileCardSelector : eventCardSelector);

test.describe('real relay search smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('smoke queries exist in src/lib/examples.ts', () => {
    for (const { query } of smokeQueries) {
      expect(exampleSet.has(query), `Missing smoke query: ${query}`).toBe(true);
    }
  });

  for (const { label, query, resultType, expectedText, expectedResolvedAuthor } of smokeQueries) {
    test(`${label}: ${query}`, async ({ page }) => {

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

      if (expectedResolvedAuthor) {
        const explanation = page.locator('#search-explanation');
        await expect(explanation).toBeVisible({ timeout: 15_000 });
        await expect
          .poll(async () => {
            const text = (await explanation.textContent()) || '';
            return text.replace(/\s+/g, ' ').trim();
          }, { timeout: 20_000 })
          .toContain(expectedResolvedAuthor);
      }

      const spinner = page.locator('#search-row .animate-spin');
      const resultCards = getResultCards(page, resultType);

      await expect
        .poll(() => resultCards.count(), { timeout: 45_000 })
        .toBeGreaterThan(0);
      await expect(resultCards.first()).toBeVisible();
      await expect(spinner).toHaveCount(0, { timeout: 45_000 });
      if (expectedText) {
        await expect
          .poll(async () => {
            const texts = await resultCards.allTextContents();
            return texts.some((text) => text.toLowerCase().includes(expectedText.toLowerCase()));
          }, { timeout: 45_000 })
          .toBe(true);
      }

      await expect(input).toHaveValue(query);

      const followUpQuery = `${query} again`;
      await input.fill(followUpQuery);
      await expect(input).toHaveValue(followUpQuery);

      expect(pageErrors).toEqual([]);
    });
  }
});
