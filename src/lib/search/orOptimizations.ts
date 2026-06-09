import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { resolveAuthor } from '../vertex';
import { Nip50Extensions } from './searchUtils';
import { applyDateFilter } from './queryParsing';
import { subscribeAndCollect } from './subscriptions';
import { sortEventsNewestFirst } from '../utils/searchUtils';

/** Extract all by: tokens from a seed string */
export function extractByTokens(seed: string): string[] {
  const matches = Array.from(seed.matchAll(/\bby:(\S+)/gi));
  return matches.map(m => m[1] || '').filter(Boolean);
}

/** Extract the content of a seed string after removing all by: clauses */
export function extractNonByContent(seed: string): string {
  return seed.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
}

/** Extract hashtag names (lowercase, without #) from a seed string */
export function extractTags(seed: string): string[] {
  const matches = Array.from(seed.matchAll(/#[A-Za-z0-9_]+/gi));
  return matches.map((m) => (m[0] || '').slice(1).toLowerCase()).filter(Boolean);
}

/** Strip by: clauses and hashtags, leaving the residual core text */
export function extractCoreWithoutByAndTags(seed: string): string {
  return seed
    .replace(/\bby:\S+/gi, '')
    .replace(/#[A-Za-z0-9_]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a list of by: tokens (npubs or names) to hex pubkeys, skipping failures */
export async function resolveByTokensToPubkeys(byTokens: string[]): Promise<string[]> {
  const resolvedPubkeys: string[] = [];
  for (const authorToken of byTokens) {
    try {
      if (/^npub1[0-9a-z]+$/i.test(authorToken)) {
        const hex = nip19.decode(authorToken).data as string;
        resolvedPubkeys.push(hex);
      } else {
        const resolved = await resolveAuthor(authorToken);
        if (resolved.pubkeyHex) {
          resolvedPubkeys.push(resolved.pubkeyHex);
        }
      }
    } catch (error) {
      console.warn(`Failed to resolve author ${authorToken}:`, error);
    }
  }
  return resolvedPubkeys;
}

/**
 * Optimize pure by: OR queries into a single filter with multiple authors.
 * Only applies when all seeds contain only by: clauses (no other content).
 * Returns null if optimization cannot be applied.
 */
export async function maybeOptimizeByOnlyOrSeeds(
  seeds: string[],
  effectiveKinds: number[],
  dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined,
  chosenRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined,
  limit: number
): Promise<NDKEvent[] | null> {
  // Trim and filter empty seeds
  const trimmedSeeds = seeds.map(s => s.trim()).filter(Boolean);
  if (trimmedSeeds.length < 2) {
    return null; // Need at least 2 seeds for OR optimization
  }

  // Check if all seeds are pure by: clauses (no residual content after stripping by:)
  for (const seed of trimmedSeeds) {
    const nonByContent = extractNonByContent(seed);
    if (nonByContent.length > 0) {
      return null; // Has residual content, not a pure by: query
    }
    // Also check that each seed has at least one by: token
    if (!/\bby:\S+/i.test(seed)) {
      return null; // Seed doesn't have a by: token
    }
  }

  // Collect all by: tokens and de-duplicate
  const allByTokens = trimmedSeeds.flatMap(extractByTokens);
  const uniqueByTokens = Array.from(new Set(allByTokens));
  if (uniqueByTokens.length === 0) {
    return null;
  }

  const resolvedPubkeys = await resolveByTokensToPubkeys(uniqueByTokens);
  if (resolvedPubkeys.length === 0) {
    return null; // No pubkeys could be resolved
  }

  // Build single filter with all authors
  const filter: NDKFilter = applyDateFilter({
    kinds: effectiveKinds,
    authors: resolvedPubkeys,
    limit: Math.max(limit, 500)
  }, dateFilter) as NDKFilter;

  // Execute single subscription
  const results = await subscribeAndCollect(filter, 10000, chosenRelaySet, abortSignal);
  return sortEventsNewestFirst(results).slice(0, limit);
}
