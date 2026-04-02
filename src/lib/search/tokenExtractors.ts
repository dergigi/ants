import { Nip50Extensions } from './searchUtils';

/**
 * Extract NIP-50 extensions from the raw query string.
 * Removes extension tokens from the query and returns them separately.
 */
export function extractNip50Extensions(rawQuery: string): { cleaned: string; extensions: Nip50Extensions } {
  let cleaned = rawQuery;
  const extensions: Nip50Extensions = {};

  const includeSpamRegex = /(?:^|\s)include:spam(?:\s|$)/gi;
  if (includeSpamRegex.test(cleaned)) {
    extensions.includeSpam = true;
    cleaned = cleaned.replace(includeSpamRegex, ' ');
  }

  const domainRegex = /(?:^|\s)domain:([^\s]+)(?:\s|$)/gi;
  cleaned = cleaned.replace(domainRegex, (_, domain: string) => {
    const value = (domain || '').trim();
    if (value) extensions.domain = value;
    return ' ';
  });

  const languageRegex = /(?:^|\s)language:([a-z]{2})(?:\s|$)/gi;
  cleaned = cleaned.replace(languageRegex, (_, lang: string) => {
    const value = (lang || '').trim().toLowerCase();
    if (value && value.length === 2) extensions.language = value;
    return ' ';
  });

  const sentimentRegex = /(?:^|\s)sentiment:(negative|neutral|positive)(?:\s|$)/gi;
  cleaned = cleaned.replace(sentimentRegex, (_, sentiment: string) => {
    const value = (sentiment || '').trim().toLowerCase();
    if (['negative', 'neutral', 'positive'].includes(value)) {
      extensions.sentiment = value as 'negative' | 'neutral' | 'positive';
    }
    return ' ';
  });

  const nsfwRegex = /(?:^|\s)nsfw:(true|false)(?:\s|$)/gi;
  cleaned = cleaned.replace(nsfwRegex, (_, nsfw: string) => {
    const value = (nsfw || '').trim().toLowerCase();
    if (value === 'true') extensions.nsfw = true;
    else if (value === 'false') extensions.nsfw = false;
    return ' ';
  });

  return { cleaned: cleaned.trim(), extensions };
}

/** Strip legacy relay filters from query (relay:..., relays:mine) */
export function stripRelayFilters(rawQuery: string): string {
  return rawQuery
    .replace(/(?:^|\s)relay:[^\s]+(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)relays:mine(?:\s|$)/gi, ' ')
    .trim();
}

/** Extract kind filter(s) from query string: supports comma-separated numbers */
export function extractKindFilter(rawQuery: string): { cleaned: string; kinds?: number[] } {
  let cleaned = rawQuery;
  const kinds: number[] = [];
  const kindRegex = /(?:^|\s)kind:([0-9]+(?:\s*,\s*[0-9]+)*)(?=\s|$)/gi;
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

/** Extract date filter(s) from query string: since:YYYY-MM-DD and until:YYYY-MM-DD */
export function extractDateFilter(rawQuery: string): { cleaned: string; since?: number; until?: number } {
  let cleaned = rawQuery;
  let since: number | undefined;
  let until: number | undefined;

  const dateToTimestamp = (dateStr: string): number => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return Math.floor(date.getTime() / 1000);
  };

  const sinceRegex = /(?:^|\s)since:([0-9]{4}-[0-9]{2}-[0-9]{2})(?=\s|$)/gi;
  cleaned = cleaned.replace(sinceRegex, (_, dateStr: string) => {
    since = dateToTimestamp(dateStr);
    return ' ';
  });

  const untilRegex = /(?:^|\s)until:([0-9]{4}-[0-9]{2}-[0-9]{2})(?=\s|$)/gi;
  cleaned = cleaned.replace(untilRegex, (_, dateStr: string) => {
    const startOfDay = dateToTimestamp(dateStr);
    until = startOfDay + 86399;
    return ' ';
  });

  return { cleaned: cleaned.trim(), since, until };
}

/**
 * Extract pp:<provider> keyword from query string.
 * Forces a specific profile lookup provider for by:/mentions: resolution.
 * Valid values: vertex, relatr, relay
 */
/** Extract all by: tokens from a string */
export function extractByTokens(seed: string): string[] {
  const matches = Array.from(seed.matchAll(/\bby:(\S+)/gi));
  return matches.map((m) => m[1] || '').filter(Boolean);
}

export type ProfileProviderKeyword = 'vertex' | 'relatr' | 'relay';

const VALID_PROFILE_PROVIDERS: readonly ProfileProviderKeyword[] = ['vertex', 'relatr', 'relay'] as const;

export function extractProfileProvider(rawQuery: string): { cleaned: string; profileProvider?: ProfileProviderKeyword } {
  const regex = /(?:^|\s)pp:(vertex|relatr|relay)(?:\s|$)/gi;
  const match = regex.exec(rawQuery);
  if (!match) return { cleaned: rawQuery };
  const raw = (match[1] || '').toLowerCase();
  const provider = VALID_PROFILE_PROVIDERS.find((p) => p === raw);
  if (!provider) return { cleaned: rawQuery };
  const cleaned = rawQuery.replace(regex, ' ').trim();
  return { cleaned, profileProvider: provider };
}
