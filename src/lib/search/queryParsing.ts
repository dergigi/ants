import { NDKFilter } from '@nostr-dev-kit/ndk';
import { Nip50Extensions } from './searchUtils';
import { parseOrQuery } from './queryTransforms';

/**
 * Extract NIP-50 extensions from the raw query string
 * Removes extension tokens from the query and returns them separately
 */
export function extractNip50Extensions(rawQuery: string): { cleaned: string; extensions: Nip50Extensions } {
  let cleaned = rawQuery;
  const extensions: Nip50Extensions = {};

  // include:spam - turn off spam filtering
  const includeSpamRegex = /(?:^|\s)include:spam(?:\s|$)/gi;
  if (includeSpamRegex.test(cleaned)) {
    extensions.includeSpam = true;
    cleaned = cleaned.replace(includeSpamRegex, ' ');
  }

  // domain:<domain> - include only events from users whose valid nip05 domain matches the domain
  const domainRegex = /(?:^|\s)domain:([^\s]+)(?:\s|$)/gi;
  cleaned = cleaned.replace(domainRegex, (_, domain: string) => {
    const value = (domain || '').trim();
    if (value) extensions.domain = value;
    return ' ';
  });

  // language:<two letter ISO 639-1 language code> - include only events of a specified language
  const languageRegex = /(?:^|\s)language:([a-z]{2})(?:\s|$)/gi;
  cleaned = cleaned.replace(languageRegex, (_, lang: string) => {
    const value = (lang || '').trim().toLowerCase();
    if (value && value.length === 2) extensions.language = value;
    return ' ';
  });

  // sentiment:<negative/neutral/positive> - include only events of a specific sentiment
  const sentimentRegex = /(?:^|\s)sentiment:(negative|neutral|positive)(?:\s|$)/gi;
  cleaned = cleaned.replace(sentimentRegex, (_, sentiment: string) => {
    const value = (sentiment || '').trim().toLowerCase();
    if (['negative', 'neutral', 'positive'].includes(value)) {
      extensions.sentiment = value as 'negative' | 'neutral' | 'positive';
    }
    return ' ';
  });

  // nsfw:<true/false> - include or exclude nsfw events (default: true)
  const nsfwRegex = /(?:^|\s)nsfw:(true|false)(?:\s|$)/gi;
  cleaned = cleaned.replace(nsfwRegex, (_, nsfw: string) => {
    const value = (nsfw || '').trim().toLowerCase();
    if (value === 'true') extensions.nsfw = true;
    else if (value === 'false') extensions.nsfw = false;
    return ' ';
  });

  return { cleaned: cleaned.trim(), extensions };
}

/**
 * Strip legacy relay filters from query (relay:..., relays:mine)
 */
export function stripRelayFilters(rawQuery: string): string {
  return rawQuery
    .replace(/(?:^|\s)relay:[^\s]+(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)relays:mine(?:\s|$)/gi, ' ')
    .trim();
}

/**
 * Extract kind filter(s) from query string: supports comma-separated numbers
 */
export function extractKindFilter(rawQuery: string): { cleaned: string; kinds?: number[] } {
  let cleaned = rawQuery;
  const kinds: number[] = [];
  const kindRegex = /(?:^|\s)kind:([0-9,\s]+)(?=\s|$)/gi;
  cleaned = cleaned.replace(kindRegex, (_, list: string) => {
    (list || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((token) => {
        const num = parseInt(token, 10);
        if (!Number.isNaN(num)) kinds.push(num);
      });
    return ' ';
  });
  const uniqueKinds = Array.from(new Set(kinds));
  return { cleaned: cleaned.trim(), kinds: uniqueKinds.length ? uniqueKinds : undefined };
}

/**
 * Extract date filter(s) from query string: since:YYYY-MM-DD and until:YYYY-MM-DD
 */
export function extractDateFilter(rawQuery: string): { cleaned: string; since?: number; until?: number } {
  let cleaned = rawQuery;
  let since: number | undefined;
  let until: number | undefined;

  // Convert YYYY-MM-DD to Unix timestamp (start of day in UTC)
  const dateToTimestamp = (dateStr: string): number => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return Math.floor(date.getTime() / 1000);
  };

  // Extract since:YYYY-MM-DD
  const sinceRegex = /(?:^|\s)since:([0-9]{4}-[0-9]{2}-[0-9]{2})(?=\s|$)/gi;
  cleaned = cleaned.replace(sinceRegex, (_, dateStr: string) => {
    since = dateToTimestamp(dateStr);
    return ' ';
  });

  // Extract until:YYYY-MM-DD
  const untilRegex = /(?:^|\s)until:([0-9]{4}-[0-9]{2}-[0-9]{2})(?=\s|$)/gi;
  cleaned = cleaned.replace(untilRegex, (_, dateStr: string) => {
    // For until, include entire day - add end of day timestamp
    const startOfDay = dateToTimestamp(dateStr);
    until = startOfDay + 86399; // Add 23:59:59 seconds
    return ' ';
  });

  return {
    cleaned: cleaned.trim(),
    since,
    until
  };
}

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

  // Remove only structural characters for inspection, but keep the original
  // string for cases where there is meaningful content.
  const tokens = trimmed
    .replace(/[()"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const hasMeaningfulToken = tokens.some((t) => !/^(OR|AND)$/i.test(t));
  return hasMeaningfulToken ? trimmed : '';
}

/**
 * Parsed query structure containing all extracted information
 */
export interface ParsedQuery {
  cleanedQuery: string;
  effectiveKinds: number[];
  dateFilter: { since?: number; until?: number };
  hasTopLevelOr: boolean;
  topLevelOrParts: string[];
  extensionFilters: Array<(content: string) => boolean>;
}

/**
 * Parse a preprocessed search query into a structured ParsedQuery object
 * This consolidates all query parsing logic into a single helper
 */
export function parseSearchQuery(
  preprocessedQuery: string,
  defaultKinds: number[]
): ParsedQuery {
  // Extract kind filters and default to provided defaultKinds when not provided
  const kindExtraction = extractKindFilter(preprocessedQuery);
  const kindCleanedQuery = kindExtraction.cleaned;
  const effectiveKinds: number[] = (kindExtraction.kinds && kindExtraction.kinds.length > 0)
    ? kindExtraction.kinds
    : defaultKinds;
  
  // Extract date filters
  const dateExtraction = extractDateFilter(kindCleanedQuery);
  const dateFilter = { since: dateExtraction.since, until: dateExtraction.until };
  const cleanedQuery = dateExtraction.cleaned;
  
  const extensionFilters: Array<(content: string) => boolean> = [];
  const topLevelOrParts = parseOrQuery(cleanedQuery);
  const hasTopLevelOr = topLevelOrParts.length > 1;

  return {
    cleanedQuery,
    effectiveKinds,
    dateFilter,
    hasTopLevelOr,
    topLevelOrParts,
    extensionFilters
  };
}

