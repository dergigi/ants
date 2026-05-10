import { expect, test, type Page } from '@playwright/test';
import { searchExamples, type SearchExample } from '../src/lib/examples';

type SmokeQuery = {
  label: string;
  query: SearchExample;
  resultType: 'event' | 'profile';
  expectedText?: string;
  expectedExplanationSubstrings?: readonly string[];
  expectedExplanationPattern?: RegExp;
};

const fiatjafResolvedQuery = 'by:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';
const socratesResolvedQuery = 'by:npub1s0cra5735s8ccw7pfvqtp4see7t7lkfr0gwrfhkhsfakuxkf5ahs83023h';
const relativeSincePattern = /\bsince:\d{4}-\d{2}-\d{2}\b/;

const smokeQueries: readonly SmokeQuery[] = [
  { label: 'basic text search', query: 'vibe coding', resultType: 'event' },
  {
    label: 'author search',
    query: 'by:fiatjaf',
    resultType: 'event',
    expectedExplanationSubstrings: ['by:fiatjaf', fiatjafResolvedQuery],
  },
  { label: 'profile search', query: 'p:fiatjaf', resultType: 'profile' },
  { label: 'kind OR search', query: 'kind:0 or kind:1', resultType: 'event' },
  { label: 'gif search', query: 'has:gif', resultType: 'event' },
  {
    label: 'second author search',
    query: 'by:socrates',
    resultType: 'event',
    expectedExplanationSubstrings: ['by:socrates', socratesResolvedQuery],
  },
  { label: 'second profile search', query: 'p:hodl', resultType: 'profile' },
  { label: 'media search', query: 'has:image', resultType: 'event' },
  { label: 'image kind search', query: 'is:image', resultType: 'event' },
  { label: 'NIP search', query: 'nip:05', resultType: 'event' },
  {
    label: 'absolute date range search',
    query: 'by:fiatjaf since:2024-01-01 until:2024-03-31',
    resultType: 'event',
    expectedExplanationSubstrings: ['since:2024-01-01', 'until:2024-03-31'],
  },
  {
    label: 'relative since date search',
    query: 'bitcoin since:2w',
    resultType: 'event',
    expectedExplanationPattern: relativeSincePattern,
  },
  {
    label: 'absolute until date search',
    query: 'by:dergigi until:2026-12-31',
    resultType: 'event',
    expectedExplanationSubstrings: ['until:2026-12-31'],
  },
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

  for (const { label, query, resultType, expectedText, expectedExplanationSubstrings, expectedExplanationPattern } of smokeQueries) {
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

      if (expectedExplanationSubstrings || expectedExplanationPattern) {
        const explanation = page.locator('#search-explanation');

        await expect(explanation).toBeVisible({ timeout: 15_000 });

        if (expectedExplanationSubstrings) {
          const explanationPattern = new RegExp(
            expectedExplanationSubstrings
              .map((candidate) => candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('|')
          );

          await expect
            .poll(
              async () => ((await explanation.textContent()) || '').replace(/\s+/g, ' ').trim(),
              {
                timeout: 20_000,
                message: `Expected explanation to contain one of: ${expectedExplanationSubstrings.join(', ')}`,
              }
            )
            .toMatch(explanationPattern);
        }

        if (expectedExplanationPattern) {
          await expect
            .poll(
              async () => ((await explanation.textContent()) || '').replace(/\s+/g, ' ').trim(),
              {
                timeout: 20_000,
                message: `Expected explanation to match: ${expectedExplanationPattern}`,
              }
            )
            .toMatch(expectedExplanationPattern);
        }
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
