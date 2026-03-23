import { NDKFilter } from '@nostr-dev-kit/ndk';
import { parseOrQuery } from './queryTransforms';
import { resolveRelativeDates } from './relativeDates';
import {
  extractKindFilter,
  extractDateFilter,
  extractProfileProvider
} from './tokenExtractors';

// Re-export extractors so existing imports keep working
export {
  extractNip50Extensions,
  stripRelayFilters,
  extractKindFilter,
  extractDateFilter,
  extractProfileProvider
} from './tokenExtractors';

/**
 * Helper function to apply date filters to a filter object
 */
export function applyDateFilter(filter: Partial<NDKFilter>, dateFilter?: { since?: number; until?: number }): Partial<NDKFilter> {
  if (!dateFilter || (!dateFilter.since && !dateFilter.until)) return filter;
  return { ...filter, ...(dateFilter.since && { since: dateFilter.since }), ...(dateFilter.until && { until: dateFilter.until }) };
}

/**
 * Normalize residual search text that remains after stripping structured tokens.
 * If the text contains only logical operators and parentheses/quotes, treat it as empty.
 */
export function normalizeResidualSearchText(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';

  const tokens = trimmed
    .replace(/[()"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const hasMeaningfulToken = tokens.some((t) => !/^(OR|AND)$/i.test(t));
  return hasMeaningfulToken ? trimmed : '';
}

/** Parsed query structure containing all extracted information */
export interface ParsedQuery {
  cleanedQuery: string;
  effectiveKinds: number[];
  dateFilter: { since?: number; until?: number };
  dateTranslation: string | null;
  hasTopLevelOr: boolean;
  topLevelOrParts: string[];
  extensionFilters: Array<(content: string) => boolean>;
  profileProvider?: string;
}

/**
 * Parse a preprocessed search query into a structured ParsedQuery object.
 * Consolidates all query parsing logic into a single helper.
 */
export function parseSearchQuery(
  preprocessedQuery: string,
  defaultKinds: number[]
): ParsedQuery {
  const ppExtraction = extractProfileProvider(preprocessedQuery);
  const profileProvider = ppExtraction.profileProvider;

  const kindExtraction = extractKindFilter(ppExtraction.cleaned);
  const kindCleanedQuery = kindExtraction.cleaned;
  const effectiveKinds: number[] = (kindExtraction.kinds && kindExtraction.kinds.length > 0)
    ? kindExtraction.kinds
    : defaultKinds;

  const { resolved: dateResolvedQuery, translation: dateTranslation } = resolveRelativeDates(kindCleanedQuery);

  const dateExtraction = extractDateFilter(dateResolvedQuery);
  const dateFilter = { since: dateExtraction.since, until: dateExtraction.until };
  const cleanedQuery = dateExtraction.cleaned;

  const extensionFilters: Array<(content: string) => boolean> = [];
  const topLevelOrParts = parseOrQuery(cleanedQuery);
  const hasTopLevelOr = topLevelOrParts.length > 1;

  return {
    cleanedQuery, effectiveKinds, dateFilter, dateTranslation,
    hasTopLevelOr, topLevelOrParts, extensionFilters, profileProvider
  };
}
