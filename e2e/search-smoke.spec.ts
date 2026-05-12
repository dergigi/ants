import { expect, test, type Locator, type Page } from '@playwright/test';
import { searchExamples, type SearchExample } from '../src/lib/examples';
import { parseDateValue } from '../src/lib/search/relativeDates';

type DateExpectation = {
  since?: string;
  until?: string;
  cardsToCheck?: number;
};

type SmokeQuery = {
  label: string;
  query: SearchExample;
  resultType: 'event' | 'profile';
  expectedText?: string;
  expectedExplanationSubstrings?: readonly string[];
  expectedExplanationPattern?: RegExp;
  expectedDateRange?: DateExpectation;
};

const dergigiResolvedQuery = 'by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
const relativeSincePattern = /\bsince:\d{4}-\d{2}-\d{2}\b/;

function patternFromAlternatives(...candidates: readonly string[]): RegExp {
  return new RegExp(
    candidates
      .map((candidate) => candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')
  );
}

const dergigiExplanationPattern = patternFromAlternatives('by:dergigi', dergigiResolvedQuery);

const smokeQueries: readonly SmokeQuery[] = [
  { label: 'basic text search', query: 'vibe coding', resultType: 'event' },
  {
    label: 'author alias search',
    query: 'by:dergigi',
    resultType: 'event',
    expectedExplanationPattern: dergigiExplanationPattern,
  },
  { label: 'profile search', query: 'p:fiatjaf', resultType: 'profile' },
  { label: 'kind OR search', query: 'kind:0 or kind:1', resultType: 'event' },
  { label: 'gif search', query: 'has:gif', resultType: 'event' },
  {
    label: 'direct npub author search',
    query: 'by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',
    resultType: 'event',
    expectedExplanationSubstrings: [dergigiResolvedQuery],
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
    expectedDateRange: { since: '2024-01-01', until: '2024-03-31' },
  },
  {
    label: 'relative since date search',
    query: 'bitcoin since:2w',
    resultType: 'event',
    expectedExplanationPattern: relativeSincePattern,
    expectedDateRange: { since: '2w' },
  },
  {
    label: 'absolute until date search',
    query: 'by:dergigi until:2026-12-31',
    resultType: 'event',
    expectedExplanationSubstrings: ['until:2026-12-31'],
    expectedDateRange: { until: '2026-12-31' },
  },
];

const exampleSet = new Set(searchExamples);
const baseCardSelector = '[class*="relative"][class*="bg-[#2d2d2d]"][class*="border-[#3d3d3d]"]';
const eventCardSelector = `${baseCardSelector}:not([class*="overflow-hidden"])`;
const profileCardSelector = `${baseCardSelector}[class*="overflow-hidden"]`;
const DEFAULT_DATE_CARDS_TO_CHECK = 5;

const getResultCards = (page: Page, resultType: 'event' | 'profile') =>
  page.locator(resultType === 'profile' ? profileCardSelector : eventCardSelector);

async function getCardExactTimestamp(card: Locator): Promise<number> {
  const timestamps = await card.locator('[data-timestamp]').evaluateAll((nodes) =>
    nodes
      .map((node) => Number.parseInt(node.getAttribute('data-timestamp') || '', 10))
      .filter((timestamp) => Number.isFinite(timestamp))
  );

  for (const timestamp of timestamps) {
    if (timestamp > 0) return timestamp;
  }

  throw new Error('No machine-readable timestamp found for card.');
}

async function expectResultDatesWithinRange(resultCards: Locator, expectedDateRange: DateExpectation): Promise<void> {
  const since = expectedDateRange.since ? parseDateValue(expectedDateRange.since, 'since')?.timestamp : undefined;
  const until = expectedDateRange.until ? parseDateValue(expectedDateRange.until, 'until')?.timestamp : undefined;

  if (expectedDateRange.since && since === undefined) {
    throw new Error(`Failed to parse expected since date: ${expectedDateRange.since}`);
  }
  if (expectedDateRange.until && until === undefined) {
    throw new Error(`Failed to parse expected until date: ${expectedDateRange.until}`);
  }

  const count = await resultCards.count();
  const cardsToCheck = Math.min(count, expectedDateRange.cardsToCheck ?? DEFAULT_DATE_CARDS_TO_CHECK);

  for (let index = 0; index < cardsToCheck; index += 1) {
    const timestamp = await getCardExactTimestamp(resultCards.nth(index));
    if (since !== undefined) {
      expect(timestamp, `Card ${index + 1} is older than since:${expectedDateRange.since}`).toBeGreaterThanOrEqual(since);
    }
    if (until !== undefined) {
      expect(timestamp, `Card ${index + 1} is newer than until:${expectedDateRange.until}`).toBeLessThanOrEqual(until);
    }
  }
}

test.describe('real relay search smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('smoke queries exist in src/lib/examples.ts', () => {
    for (const { query } of smokeQueries) {
      expect(exampleSet.has(query), `Missing smoke query: ${query}`).toBe(true);
    }
  });

  for (const { label, query, resultType, expectedText, expectedExplanationSubstrings, expectedExplanationPattern, expectedDateRange } of smokeQueries) {
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
        const getExplanationText = async () => ((await explanation.textContent()) || '').replace(/\s+/g, ' ').trim();

        await expect(explanation).toBeVisible({ timeout: 15_000 });

        if (expectedExplanationSubstrings) {
          for (const expectedSubstring of expectedExplanationSubstrings) {
            await expect
              .poll(getExplanationText, {
                timeout: 20_000,
                message: `Expected explanation to contain: ${expectedSubstring}`,
              })
              .toContain(expectedSubstring);
          }
        }

        if (expectedExplanationPattern) {
          await expect
            .poll(getExplanationText, {
              timeout: 20_000,
              message: `Expected explanation to match: ${expectedExplanationPattern}`,
            })
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

      if (expectedDateRange) {
        await expectResultDatesWithinRange(resultCards, expectedDateRange);
      }

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
