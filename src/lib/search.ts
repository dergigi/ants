import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk, connectWithTimeout, markRelayActivity, safeSubscribe, isValidFilter } from './ndk';
import { getStoredPubkey } from './nip07';
import { searchProfilesFullText, resolveNip05ToPubkey, profileEventFromPubkey, resolveAuthor } from './vertex';
import { nip19 } from 'nostr-tools';
import { relaySets, RELAYS, getNip50SearchRelaySet } from './relays';

// Type definitions for relay objects
// interface RelayObject {
//   url?: string;
//   relay?: {
//     url?: string;
//   };
// }

// NIP-50 extension options
interface Nip50Extensions {
  includeSpam?: boolean;
  domain?: string;
  language?: string;
  sentiment?: 'negative' | 'neutral' | 'positive';
  nsfw?: boolean;
}

interface NDKEventWithRelaySource extends NDKEvent {
  relaySource?: string;
  relaySources?: string[]; // Track all relays where this event was found
}

// Ensure newest-first ordering by created_at
function sortEventsNewestFirst(events: NDKEvent[]): NDKEvent[] {
  return [...events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

// DRY helpers for streaming aggregation (inline usage keeps code clean without unused warnings)
type EmitFn = (results: NDKEvent[], isComplete: boolean) => void;
const addUniqueResults = (target: Map<string, NDKEvent>, arr: NDKEvent[]): void => {
  for (const e of arr) if (!target.has(e.id)) target.set(e.id, e);
};
const emitMergedFromMap = (map: Map<string, NDKEvent>, limit: number, emit?: EmitFn, isComplete: boolean = false): void => {
  if (!emit) return;
  const merged = Array.from(map.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  emit(merged.slice(0, limit), isComplete);
};
// Note: streamFilterIntoMap is currently unused but kept for future DRY use; remove comment to use when needed.
// function streamFilterIntoMap(
//   filter: NDKFilter,
//   options: { timeoutMs?: number; maxResults?: number; relaySet?: NDKRelaySet; abortSignal?: AbortSignal; emit?: EmitFn; limit?: number }
// ): Promise<NDKEvent[]> {
//   const seen = new Map<string, NDKEvent>();
//   return subscribeAndStream(filter, {
//     timeoutMs: options.timeoutMs,
//     maxResults: options.maxResults,
//     relaySet: options.relaySet,
//     abortSignal: options.abortSignal,
//     onResults: (arr, isComplete) => {
//       addUniqueResults(seen, arr);
//       emitMergedFromMap(seen, options.limit ?? (options.maxResults || 1000), options.emit, isComplete);
//     }
//   }).then(() => Array.from(seen.values()));
// }

// Extend filter type to include tag queries for "t" (hashtags)
type TagTFilter = NDKFilter & { '#t'?: string[] };



// Centralized media extension lists (keep DRY)
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'gifs', 'apng', 'webp', 'avif', 'svg'] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'] as const;
export const GIF_EXTENSIONS = ['gif', 'gifs', 'apng'] as const;


// Use a search-capable relay set explicitly for NIP-50 queries (lazy, async)
let searchRelaySetPromise: Promise<NDKRelaySet> | null = null;
async function getSearchRelaySet(): Promise<NDKRelaySet> {
  if (!searchRelaySetPromise) searchRelaySetPromise = relaySets.search();
  return searchRelaySetPromise;
}

// (Removed heuristic content filter; rely on recursive OR expansion + relay-side search)

// Extract NIP-50 extensions from the raw query string
function extractNip50Extensions(rawQuery: string): { cleaned: string; extensions: Nip50Extensions } {
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

// Build search query with NIP-50 extensions
function buildSearchQueryWithExtensions(baseQuery: string, extensions: Nip50Extensions): string {
  if (!baseQuery.trim()) return baseQuery;
  
  let searchQuery = baseQuery;
  
  // Add NIP-50 extensions as key:value pairs
  if (extensions.includeSpam) {
    searchQuery += ' include:spam';
  }
  
  if (extensions.domain) {
    searchQuery += ` domain:${extensions.domain}`;
  }
  
  if (extensions.language) {
    searchQuery += ` language:${extensions.language}`;
  }
  
  if (extensions.sentiment) {
    searchQuery += ` sentiment:${extensions.sentiment}`;
  }
  
  if (extensions.nsfw !== undefined) {
    searchQuery += ` nsfw:${extensions.nsfw}`;
  }
  
  return searchQuery;
}

// Strip legacy relay filters from query (relay:..., relays:mine)
function stripRelayFilters(rawQuery: string): string {
  return rawQuery
    .replace(/(?:^|\s)relay:[^\s]+(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)relays:mine(?:\s|$)/gi, ' ')
    .trim();
}

// Extract kind filter(s) from query string: supports comma-separated numbers
function extractKindFilter(rawQuery: string): { cleaned: string; kinds?: number[] } {
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

// Streaming subscription that keeps connections open and streams results
async function subscribeAndStream(
  filter: NDKFilter, 
  options: {
    timeoutMs?: number;
    maxResults?: number;
    onResults?: (results: NDKEvent[], isComplete: boolean) => void;
    relaySet?: NDKRelaySet;
    abortSignal?: AbortSignal;
  } = {}
): Promise<NDKEvent[]> {
  const { timeoutMs = 30000, maxResults = 1000, onResults, relaySet, abortSignal } = options;
  const rs = relaySet || await getSearchRelaySet();
  
  return new Promise<NDKEvent[]>((resolve) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      resolve([]);
      return;
    }

    // Validate filter
    if (!isValidFilter(filter)) {
      console.warn('Invalid filter passed to subscribeAndStream, returning empty results');
      resolve([]);
      return;
    }

    // Log the actual filter used for streaming (after limit removal)

    const collected: Map<string, NDKEvent> = new Map();
    let isComplete = false;
    let lastEmitTime = 0;
    const emitInterval = 500; // Emit results every 500ms

    // Remove limit from filter for streaming - we'll handle it ourselves
    const streamingFilter = { ...filter };
    delete streamingFilter.limit;

    // Validate the streaming filter after modification
    if (!isValidFilter(streamingFilter)) {
      console.warn('Streaming filter became invalid after removing limit, returning empty results');
      resolve([]);
      return;
    }

    // Debug: Log search details (can be removed after testing)
    // console.log('subscribeAndStream called with filter:', streamingFilter);
    // console.log('Using relay set:', Array.from(rs.relays).map(r => r.url));
    const sub = safeSubscribe([streamingFilter], {
      closeOnEose: false, // Keep connection open!
      cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
      relaySet: rs
    });

    if (!sub) {
      console.warn('Failed to create subscription in subscribeAndStream');
      resolve([]);
      return;
    }

    const timer = setTimeout(() => {
      isComplete = true;
      try { sub.stop(); } catch {}
      // Final emit before resolving
      const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      if (onResults) {
        onResults(sortedResults, true);
      }
      resolve(sortedResults);
    }, timeoutMs);

    // Handle abort signal
    const abortHandler = () => {
      isComplete = true;
      try { sub.stop(); } catch {}
      clearTimeout(timer);
      if (abortSignal) {
        try { abortSignal.removeEventListener('abort', abortHandler); } catch {}
      }
      const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      if (onResults) {
        onResults(sortedResults, true);
      }
      resolve(sortedResults);
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }

    // Periodic emission of results
    const emitResults = () => {
      if (onResults && !isComplete) {
        const now = Date.now();
        if (now - lastEmitTime >= emitInterval) {
          const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          onResults(sortedResults, false);
          lastEmitTime = now;
        }
      }
    };

    sub.on('event', (event: NDKEvent, relay: NDKRelay | undefined) => {
      const relayUrl = relay?.url || 'unknown';
      // Mark this relay as active
      if (relayUrl !== 'unknown') {
        try { markRelayActivity(relayUrl); } catch {}
      }

      // Debug: Log received events to see if they match our search (can be removed after testing)
      // const contentPreview = (event.content || '').substring(0, 200);
      // console.log('Received event:', {
      //   id: event.id,
      //   author: event.author?.pubkey,
      //   relay: relayUrl,
      //   content: contentPreview,
      //   created_at: event.created_at
      // });

      if (!collected.has(event.id)) {
        const eventWithSource = event as NDKEventWithRelaySource;
        eventWithSource.relaySource = relayUrl;
        eventWithSource.relaySources = [relayUrl];
        collected.set(event.id, eventWithSource);

        // Check if we've hit max results
        if (maxResults && collected.size >= maxResults) {
          isComplete = true;
          try { sub.stop(); } catch {}
          clearTimeout(timer);
          const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          if (onResults) {
            onResults(sortedResults, true);
          }
          resolve(sortedResults);
          return;
        }

        // Emit results periodically
        emitResults();
      } else {
        // Event already exists, add this relay to the sources
        const existingEvent = collected.get(event.id) as NDKEventWithRelaySource;
        if (existingEvent.relaySources && !existingEvent.relaySources.includes(relayUrl)) {
          existingEvent.relaySources.push(relayUrl);
        }
      }
    });

    sub.on('eose', () => {
      console.log('EOSE received, but keeping connection open for more results...');
      // Don't close on EOSE - keep streaming!
    });

    sub.start();
  });
}

// Removed non-streaming subscribeAndCollect; all searches use streaming.

async function searchByAnyTerms(
  terms: string[],
  limit: number,
  relaySet: NDKRelaySet,
  abortSignal?: AbortSignal,
  nip50Extensions?: Nip50Extensions,
  baseFilter?: Partial<NDKFilter>
): Promise<NDKEvent[]> {
  // Run independent NIP-50 searches for each term and merge results (acts like boolean OR)
  const seen = new Set<string>();
  const merged: NDKEvent[] = [];
  for (const term of terms) {
    try {
      const searchQuery = nip50Extensions ? buildSearchQueryWithExtensions(term, nip50Extensions) : term;
      const filter: NDKFilter = {
        kinds: [1],
        ...(baseFilter || {}),
        search: searchQuery,
        limit: Math.max(limit, 200)
      };
      const res = await subscribeAndStream(filter, { timeoutMs: 8000, maxResults: Math.max(limit, 200), relaySet, abortSignal });
      for (const evt of res) {
        if (!seen.has(evt.id)) { seen.add(evt.id); merged.push(evt); }
      }
    } catch (error) {
      // Don't log aborted searches as errors
      if (error instanceof Error && error.message === 'Search aborted') {
        return merged; // Return what we have so far
      }
      // Log other errors but continue
      console.warn('Search term failed:', term, error);
    }
  }
  return merged;
}

async function getUserRelayUrlsFromWellKnown(pubkey: string, nip05?: string): Promise<string[]> {
  if (!nip05) return [];
  
  try {
    const [, domain] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    if (!domain) return [];
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://${domain}/.well-known/nostr.json`, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!res.ok) return [];
    const data = await res.json();
    
    // Check if this pubkey has relays listed in well-known
    const relays = data?.relays?.[pubkey.toLowerCase()];
    if (Array.isArray(relays) && relays.length > 0) {
      const normalized = relays
        .filter((r: unknown): r is string => typeof r === 'string')
        .map((r: string) => /^wss?:\/\//i.test(r) ? r : `wss://${r}`);
      console.log('Discovered user relays from well-known:', { count: normalized.length, relays: normalized, domain });
      return normalized;
    }
  } catch (error) {
    console.warn('Failed to fetch relays from well-known:', error);
  }
  
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getUserRelayUrls(timeoutMs: number = 6000): Promise<string[]> {
  try {
    const pubkey = getStoredPubkey();
    if (!pubkey) return [];

    // First try to get relays from well-known (faster, more reliable)
    const user = new NDKUser({ pubkey });
    user.ndk = ndk;
    try {
      await user.fetchProfile();
      const wellKnownRelays = await getUserRelayUrlsFromWellKnown(pubkey, user.profile?.nip05);
      if (wellKnownRelays.length > 0) {
        return wellKnownRelays;
      }
    } catch (error) {
      console.warn('Failed to fetch profile for well-known relay lookup:', error);
    }

    // Fallback to NIP-65 (kind 10002) if well-known doesn't have relays
    return await new Promise<string[]>((resolve) => {
      let latest: NDKEvent | null = null;
      const sub = safeSubscribe([{ kinds: [10002], authors: [pubkey], limit: 3 }], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY });
      if (!sub) {
        resolve([]);
        return;
      }
      const timer = setTimeout(() => { try { sub.stop(); } catch {}; resolve([]); }, timeoutMs);
      sub.on('event', (e: NDKEvent) => {
        if (!latest || ((e.created_at || 0) > (latest.created_at || 0))) {
          latest = e;
        }
      });
      sub.on('eose', () => {
        clearTimeout(timer);
        if (!latest) return resolve([]);
        const urls = new Set<string>();
        for (const tag of latest.tags as unknown as string[][]) {
          if (Array.isArray(tag) && tag[0] === 'r' && tag[1]) {
            const raw = tag[1];
            const normalized = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
            urls.add(normalized);
          }
        }
        const arr = Array.from(urls);
        console.log('Discovered user relays from kind 10002 (fallback):', { count: arr.length, relays: arr });
        resolve(arr);
      });
      sub.start();
    });
  } catch {
    return [];
  }
}

function isNpub(str: string): boolean {
  return str.startsWith('npub1') && str.length > 10;
}

function getPubkey(str: string): string | null {
  if (isNpub(str)) {
    try {
      const { data } = nip19.decode(str);
      return data as string;
    } catch (error) {
      console.error('Error decoding npub:', error);
      return null;
    }
  }
  return str;
}




export function parseOrQuery(query: string): string[] {
  // Split by " OR " (case-insensitive) while preserving quoted segments
  const parts: string[] = [];
  let currentPart = '';
  let inQuotes = false;

  const stripOuterQuotes = (value: string): string => {
    const trimmed = value.trim();
    return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  };

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentPart += char;
      continue;
    }

    // Detect the literal sequence " OR " when not inside quotes
    if (!inQuotes && query.substr(i, 4).toUpperCase() === ' OR ') {
      const cleaned = stripOuterQuotes(currentPart);
      if (cleaned) parts.push(cleaned);
      currentPart = '';
      i += 3; // skip the remaining characters of " OR " (loop will +1)
      continue;
    }

    currentPart += char;
  }

  const cleaned = stripOuterQuotes(currentPart);
  if (cleaned) parts.push(cleaned);
  return parts;
}

// Expand queries with parenthesized OR blocks by distributing surrounding terms.
// Example: "GM (.mp4 OR .jpg)" -> ["GM .mp4", "GM .jpg"]
export function expandParenthesizedOr(query: string): string[] {
  const normalize = (s: string) => s.replace(/\s{2,}/g, ' ').trim();
  const needsSpace = (leftLast: string | undefined, rightFirst: string | undefined): boolean => {
    if (!leftLast || !rightFirst) return false;
    if (/\s/.test(leftLast)) return false; // already spaced
    if (/\s/.test(rightFirst)) return false; // already spaced
    // If right begins with a dot or alphanumeric, and left ends with alphanumeric or ':' (e.g., by:npub)
    // insert a space to avoid unintended token merge like "GM.png".
    const leftWordy = /[A-Za-z0-9:_]$/.test(leftLast);
    const rightWordyOrDot = /^[A-Za-z0-9.]/.test(rightFirst);
    return leftWordy && rightWordyOrDot;
  };
  const smartJoin = (a: string, b: string): string => {
    if (!a) return b;
    if (!b) return a;
    const leftLast = a[a.length - 1];
    const rightFirst = b[0];
    return needsSpace(leftLast, rightFirst) ? `${a} ${b}` : `${a}${b}`;
  };
  const unique = (arr: string[]) => Array.from(new Set(arr.map(normalize)));

  const rx = /\(([^()]*?\s+OR\s+[^()]*?)\)/i; // innermost () that contains an OR
  const work = normalize(query);
  const m = work.match(rx);
  if (!m) return [work];

  const start = m.index || 0;
  const end = start + m[0].length;
  const before = work.slice(0, start);
  const inner = m[1];
  const after = work.slice(end);

  // Split inner by OR (case-insensitive), keep tokens as-is
  const alts = inner.split(/\s+OR\s+/i).map((s) => s.trim()).filter(Boolean);
  const expanded: string[] = [];
  for (const alt of alts) {
    const joined = smartJoin(before, alt);
    const next = normalize(smartJoin(joined, after));
    for (const ex of expandParenthesizedOr(next)) {
      expanded.push(ex);
    }
  }
  return unique(expanded);
}

// Streaming search options
interface StreamingSearchOptions {
  exact?: boolean;
  streaming?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  onResults?: (results: NDKEvent[], isComplete: boolean) => void;
}

export async function searchEvents(
  query: string,
  limit: number = 200,
  options?: { exact?: boolean } | StreamingSearchOptions,
  relaySetOverride?: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  // Check if already aborted
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Ensure we're connected before issuing any queries (with timeout)
  try {
    await connectWithTimeout(3000);
  } catch (e) {
    console.warn('NDK connect failed or timed out:', e);
    // Continue anyway - search might still work with cached connections
  }

  // Check if aborted after connection
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Force streaming for all searches
  const streamingOptions: StreamingSearchOptions = {
    ...(options as StreamingSearchOptions),
    streaming: true
  };
  const isStreaming = true;

  // Extract NIP-50 extensions first
  const nip50Extraction = extractNip50Extensions(query);
  const nip50Extensions = nip50Extraction.extensions;
  
  // Remove legacy relay filters and choose the default search relay set
  const chosenRelaySet: NDKRelaySet = relaySetOverride
    ? relaySetOverride
    : await getNip50SearchRelaySet();

  // Strip legacy relay filters but keep the rest of the query intact; any replacements
  // are applied earlier at the UI layer via the simple preprocessor.
  const extCleanedQuery = stripRelayFilters(nip50Extraction.cleaned);
  // Extract kind filters and default to [1] when not provided
  const kindExtraction = extractKindFilter(extCleanedQuery);
  const cleanedQuery = kindExtraction.cleaned;
  const effectiveKinds: number[] = (kindExtraction.kinds && kindExtraction.kinds.length > 0)
    ? kindExtraction.kinds
    : [1];
  const extensionFilters: Array<(content: string) => boolean> = [];


  // Distribute parenthesized OR seeds across the entire query BEFORE any specialized handling
  // e.g., "(GM OR GN) by:dergigi" => ["GM by:dergigi", "GN by:dergigi"]
  {
    const expandedSeeds = expandParenthesizedOr(cleanedQuery);
    if (expandedSeeds.length > 1) {
      // If streaming, run all expanded seeds concurrently and emit progressive merges
      if (isStreaming && streamingOptions?.onResults) {
        const seenMap = new Map<string, NDKEvent>();
        const emitMerged = (isComplete: boolean) => emitMergedFromMap(seenMap, limit, streamingOptions.onResults, isComplete);

        await Promise.allSettled(
          expandedSeeds.map((seed) =>
            searchEvents(
              seed,
              limit,
              {
                ...(streamingOptions as StreamingSearchOptions),
                streaming: true,
                onResults: (res) => {
                  addUniqueResults(seenMap, res);
                  emitMerged(false);
                }
              },
              chosenRelaySet,
              abortSignal
            ).then((finalResults) => {
              // Also merge any final results that weren't streamed
              if (finalResults && finalResults.length > 0) {
                addUniqueResults(seenMap, finalResults);
                emitMerged(false);
              }
            })
          )
        );

        const final = Array.from(seenMap.values())
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
          .slice(0, limit);
        streamingOptions.onResults(final, true);
        return final;
      }

      // Always streaming: fan out and merge
      const seenMap = new Map<string, NDKEvent>();
      const emitMerged = (isComplete: boolean) => emitMergedFromMap(seenMap, limit, streamingOptions?.onResults, isComplete);
      await Promise.allSettled(
        expandedSeeds.map((seed) =>
          searchEvents(seed, limit, { ...streamingOptions, streaming: true }, chosenRelaySet, abortSignal)
            .then((results) => {
              if (results && results.length > 0) {
                addUniqueResults(seenMap, results);
              }
            })
        )
      );
      emitMerged(true);
      return Array.from(seenMap.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
    }
  }

  // EARLY: Author filter handling (resolve by:<author> to npub and use authors[] filter)
  const earlyAuthorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (earlyAuthorMatch) {
    const [, author] = earlyAuthorMatch;
    // Preserve surrounding whitespace when stripping the by: token to avoid
    // concatenating adjacent tokens (e.g., "GM" and ".jpg" -> "GM.jpg").
    const terms = cleanedQuery
      .replace(/(^|\s)by:(\S+)(?=\s|$)/gi, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
    console.log('Found author filter (early):', { author, terms });

    let pubkey: string | null = null;
    try {
      const resolved = await resolveAuthor(author);
      pubkey = resolved.pubkeyHex;
    } catch {}

    if (!pubkey) {
      console.log('No valid pubkey found for author:', author);
      return [];
    }

    // Expand parenthesized OR seeds inside remaining terms
    const seedExpansions = terms ? expandParenthesizedOr(terms) : [terms];
    const filters: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 200) };
    if (terms && seedExpansions.length === 1) {
      filters.search = buildSearchQueryWithExtensions(terms, nip50Extensions);
    }

    {
      const lf = { ...filters } as Record<string, unknown>;
      delete (lf as { limit?: unknown }).limit;
      console.log('Streaming with filters (early author):', lf);
    }
    let res: NDKEvent[] = [];
    if (isStreaming && streamingOptions?.onResults) {
      // STREAMING path for early author
      const seenMap = new Map<string, NDKEvent>();
      const emitMerged = (isComplete: boolean) => {
        const mergedArr = Array.from(seenMap.values());
        const sorted = mergedArr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
        streamingOptions.onResults!(sorted, isComplete);
      };

      if (terms && seedExpansions.length > 1) {
        // Fan out seeds in parallel, streaming partials
        // Use global deduplication to prevent duplicate events across parallel searches
        const globalSeen = new Set<string>();
        const globalMutex = new Map<string, NDKEvent>();

        await Promise.allSettled(
          seedExpansions.map((seed) => {
            const searchQuery = buildSearchQueryWithExtensions(seed, nip50Extensions);
            const f: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], search: searchQuery };
            // Debug: Log search details (can be removed after testing)
            // console.log('Early author streaming search:', { seed, searchQuery, filter: f });
            return subscribeAndStream(f, {
              timeoutMs: streamingOptions?.timeoutMs || 30000,
              maxResults: streamingOptions?.maxResults || 1000,
              onResults: (arr, isComplete) => {
                // Debug: Log results (can be removed after testing)
                // console.log('Early author streaming results:', { seed, resultCount: arr.length, isComplete, sampleContent: arr.slice(0, 3).map(e => e.content?.substring(0, 100)) });
                // Global deduplication across all parallel searches
                const newEvents: NDKEvent[] = [];
                for (const e of arr) {
                  if (!globalSeen.has(e.id)) {
                    globalSeen.add(e.id);
                    globalMutex.set(e.id, e);
                    newEvents.push(e);
                  }
                }
                // Only add new events to seenMap for emission
                for (const e of newEvents) {
                  seenMap.set(e.id, e);
                }
                emitMerged(isComplete);
              },
              relaySet: chosenRelaySet,
              abortSignal
            });
          })
        );
        // After all streams settle, emit completion just in case none marked complete
        emitMerged(true);
      } else {
        // Single filter stream (with or without terms)
        await subscribeAndStream(
          filters.search ? { ...filters, limit: undefined } : { kinds: effectiveKinds, authors: [pubkey] },
          {
            timeoutMs: streamingOptions?.timeoutMs || 30000,
            maxResults: streamingOptions?.maxResults || 1000,
            onResults: (arr, isComplete) => {
              for (const e of arr) { if (!seenMap.has(e.id)) seenMap.set(e.id, e); }
              emitMerged(isComplete);
            },
            relaySet: chosenRelaySet,
            abortSignal
          }
        );
      }

      res = Array.from(seenMap.values());

      // In streaming mode, don't run non-streaming fallbacks; emit final sorted result
      {
        const dedupe = new Map<string, NDKEvent>();
        for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
        const finalResults = sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
        return finalResults;
      }
    }
    const seedMatches = Array.from(terms.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
    const seedTerms: string[] = [];
    for (const m of seedMatches) {
      const inner = (m[1] || '').trim();
      if (!inner) continue;
      inner.split(/\s+OR\s+/i).forEach((t) => { const token = t.trim(); if (token) seedTerms.push(token); });
    }
    if (seedTerms.length > 0) {
      try { const seeded = await searchByAnyTerms(seedTerms, limit, chosenRelaySet, abortSignal, nip50Extensions, { authors: [pubkey], kinds: effectiveKinds }); res = [...res, ...seeded]; } catch {}
    }
    const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
    const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
    if (res.length === 0) {
      res = await subscribeAndStream(filters, { timeoutMs: 10000, maxResults: streamingOptions?.maxResults || 1000, relaySet: broadRelaySet, abortSignal });
    }
    const termStr = terms.trim();
    const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
    if (res.length === 0 && termStr) {
      const authorOnly = await subscribeAndStream({ kinds: effectiveKinds, authors: [pubkey] }, { timeoutMs: 10000, maxResults: Math.max(limit, 600), relaySet: broadRelaySet, abortSignal });
      const needle = termStr.toLowerCase();
      res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
    } else if (res.length === 0 && hasShortToken) {
      const authorOnly = await subscribeAndStream({ kinds: effectiveKinds, authors: [pubkey] }, { timeoutMs: 10000, maxResults: Math.max(limit, 600), relaySet: broadRelaySet, abortSignal });
      const needle = termStr.toLowerCase();
      res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
    }
    const dedupe = new Map<string, NDKEvent>();
    for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
    return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
  }

  // (Already expanded above)

  // Check for top-level OR operator (outside parentheses)
  const orParts = parseOrQuery(cleanedQuery);
  if (orParts.length > 1) {
    console.log('Processing OR query with parts:', orParts);

    // Streaming path: fan-out parallel searches and emit merged updates
    if (isStreaming && streamingOptions?.onResults) {
      const seenMap = new Map<string, NDKEvent>();
      const emitMerged = (isComplete: boolean) => {
        const mergedArr = Array.from(seenMap.values());
        const sorted = mergedArr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
        streamingOptions.onResults!(sorted, isComplete);
      };

      await Promise.allSettled(
        orParts.map((part) =>
          searchEvents(
            part,
            limit,
            {
              ...(streamingOptions as StreamingSearchOptions),
              streaming: true,
              onResults: (res) => {
                for (const e of res) {
                  if (!seenMap.has(e.id)) seenMap.set(e.id, e);
                }
                emitMerged(false);
              }
            },
            chosenRelaySet,
            abortSignal
          )
        )
      );

      const final = Array.from(seenMap.values())
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .slice(0, limit);
      streamingOptions.onResults(final, true);
      return final;
    }

    // Always streaming for OR without author
    const seenMap = new Map<string, NDKEvent>();
    const emitMerged = (isComplete: boolean) => {
      const mergedArr = Array.from(seenMap.values());
      const sorted = mergedArr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
      if (streamingOptions?.onResults) streamingOptions.onResults(sorted, isComplete);
    };
    await Promise.allSettled(
      orParts.map((part) => searchEvents(part, limit, { ...streamingOptions, streaming: true }, chosenRelaySet, abortSignal))
    );
    emitMerged(true);
    return Array.from(seenMap.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
  }

  // URL search: always do exact (literal) match for http(s) URLs
  try {
    const url = new URL(cleanedQuery);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const searchQuery = buildSearchQueryWithExtensions(`"${cleanedQuery}"`, nip50Extensions);
      const results = await subscribeAndStream({
        kinds: effectiveKinds,
        search: searchQuery
      }, {
        timeoutMs: streamingOptions?.timeoutMs || 30000,
        maxResults: streamingOptions?.maxResults || 1000,
        onResults: streamingOptions?.onResults,
        relaySet: chosenRelaySet,
        abortSignal
      });
      const res = results;
      return sortEventsNewestFirst(res).slice(0, limit);
    }
  } catch {}

  // nevent/note bech32: fetch by id (optionally using relays embedded in nevent)
  try {
    const decoded = nip19.decode(extCleanedQuery);
    if (decoded?.type === 'nevent') {
      const data = decoded.data as { id: string; relays?: string[] };
      const neventRelays = Array.isArray(data.relays) ? Array.from(new Set(
        data.relays
          .filter((r: unknown): r is string => typeof r === 'string')
          .map((r) => /^wss?:\/\//i.test(r) ? r : `wss://${r}`)
      )) : [];
      const setsToTry: NDKRelaySet[] = [];
      if (neventRelays.length > 0) {
        setsToTry.push(NDKRelaySet.fromRelayUrls(neventRelays, ndk));
      }
      // Try a broader default set next
      setsToTry.push(NDKRelaySet.fromRelayUrls([...RELAYS.DEFAULT], ndk));
      // Finally try the chosen search set
      setsToTry.push(chosenRelaySet);

      for (const rs of setsToTry) {
        const byId = await subscribeAndStream({ ids: [data.id] }, { timeoutMs: 8000, maxResults: 1, relaySet: rs, abortSignal });
        if (byId.length > 0) return byId;
      }
      return [];
    }
    if (decoded?.type === 'note') {
      const id = decoded.data as string;
      const setsToTry: NDKRelaySet[] = [
        NDKRelaySet.fromRelayUrls([...RELAYS.DEFAULT], ndk),
        chosenRelaySet
      ];
      for (const rs of setsToTry) {
        const byId = await subscribeAndStream({ ids: [id] }, { timeoutMs: 8000, maxResults: 1, relaySet: rs, abortSignal });
        if (byId.length > 0) return byId;
      }
      return [];
    }
  } catch {}

  // Pure hashtag search: use tag-based filter across broad relay set (no NIP-50 required)
  const hashtagMatches = cleanedQuery.match(/#[A-Za-z0-9_]+/g) || [];
  const nonHashtagRemainder = cleanedQuery.replace(/#[A-Za-z0-9_]+/g, '').trim();
  if (hashtagMatches.length > 0 && nonHashtagRemainder.length === 0) {
    const tags = Array.from(new Set(hashtagMatches.map((h) => h.slice(1).toLowerCase())));
    const tagFilter: TagTFilter = { kinds: effectiveKinds, '#t': tags, limit: Math.max(limit, 500) };

    // Broader relay set than NIP-50 search: default + search relays
    const broadRelays = Array.from(
      new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH].map((u) => u as string))
    );
    const tagRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);

    const results = await subscribeAndStream(tagFilter, {
      timeoutMs: streamingOptions?.timeoutMs || 30000,
      maxResults: streamingOptions?.maxResults || 1000,
      onResults: streamingOptions?.onResults,
      relaySet: tagRelaySet,
      abortSignal
    });

    let final = results;
    if (extensionFilters.length > 0) {
      final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
    }
    return final
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  }

  // Full-text profile search `p:<term>` (not only username)
  // Also supports hex or npub directly to fetch that exact profile
  const fullProfileMatch = cleanedQuery.match(/^p:(.+)$/i);
  if (fullProfileMatch) {
    const term = (fullProfileMatch[1] || '').trim();
    if (!term) return [];
    // If term is an npub or 64-char hex, fetch the exact profile event
    if (/^npub1[0-9a-z]+$/i.test(term)) {
      try {
        const decoded = nip19.decode(term);
        if (decoded?.type === 'npub' && typeof decoded.data === 'string') {
          const evt = await profileEventFromPubkey(decoded.data);
          return evt ? [evt] : [];
        }
      } catch {}
    }
    if (/^[0-9a-fA-F]{64}$/.test(term)) {
      try {
        const evt = await profileEventFromPubkey(term.toLowerCase());
        return evt ? [evt] : [];
      } catch {}
    }
    // Otherwise, do a general full-text profile search
    try {
      const profiles = await searchProfilesFullText(term, 21);
      return profiles;
    } catch (error) {
      console.warn('Full-text profile search failed:', error);
      return [];
    }
  }

  // Check if the query is a direct npub
  if (isNpub(cleanedQuery)) {
    try {
      const pubkey = getPubkey(cleanedQuery);
      if (!pubkey) return [];

      const res = await subscribeAndStream({
        kinds: effectiveKinds,
        authors: [pubkey]
      }, { timeoutMs: 8000, maxResults: Math.max(limit, 200), relaySet: chosenRelaySet, abortSignal });
      return sortEventsNewestFirst(res).slice(0, limit);
    } catch (error) {
      console.error('Error processing npub query:', error);
      return [];
    }
  }

  // NIP-05 resolution: '@name@domain' or 'domain.tld' or '@domain.tld'
  const nip05Like = cleanedQuery.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
  if (nip05Like) {
    try {
      const pubkey = await resolveNip05ToPubkey(cleanedQuery);
      if (pubkey) {
        const profileEvt = await profileEventFromPubkey(pubkey);
        return [profileEvt];
      }
    } catch {}
  }

  // Check for author filter
  const authorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (authorMatch) {
    const [, author] = authorMatch;
    // Extract search terms by removing the author filter while preserving spacing
    const terms = cleanedQuery
      .replace(/(^|\s)by:(\S+)(?=\s|$)/gi, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
    console.log('Found author filter:', { author, terms });

    let pubkey: string | null = null;
    try {
      // Unified resolver handles npub, nip05, and username with a single DVM attempt
      const resolved = await resolveAuthor(author);
      pubkey = resolved.pubkeyHex;
    } catch (error) {
      console.error('Error resolving author:', error);
    }

    if (!pubkey) {
      console.log('No valid pubkey found for author:', author);
      return [];
    }

    const filters: NDKFilter = {
      kinds: effectiveKinds,
      authors: [pubkey],
      limit: Math.max(limit, 200)
    };

    // Add search term to the filter if present
    if (terms) {
      const seedExpansions2 = expandParenthesizedOr(terms);
      if (seedExpansions2.length === 1) {
        filters.search = buildSearchQueryWithExtensions(terms, nip50Extensions);
        filters.limit = Math.max(limit, 200);
      }
    }

    // No additional post-filtering; use default limits

    {
      const lf = { ...filters } as Record<string, unknown>;
      delete (lf as { limit?: unknown }).limit;
      console.log('Streaming with filters:', lf);
    }
    {
      // Fetch by base terms if any, restricted to author
      let res: NDKEvent[] = [];
      if (isStreaming && streamingOptions?.onResults) {
        const seenMap = new Map<string, NDKEvent>();
        const emitMerged = (isComplete: boolean) => {
          const mergedArr = Array.from(seenMap.values());
          const sorted = mergedArr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
          streamingOptions.onResults!(sorted, isComplete);
        };
        if (terms) {
          const seedExpansions3 = expandParenthesizedOr(terms);
          if (seedExpansions3.length > 1) {
            // Use global deduplication for non-streaming path too
            const globalSeen = new Set<string>();
            await Promise.allSettled(
              seedExpansions3.map((seed) => {
                const f: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], search: buildSearchQueryWithExtensions(seed, nip50Extensions) };
                return subscribeAndStream(f, {
                  timeoutMs: streamingOptions?.timeoutMs || 30000,
                  maxResults: streamingOptions?.maxResults || 1000,
                  onResults: (arr, isComplete) => {
                    // Global deduplication
                    const newEvents: NDKEvent[] = [];
                    for (const e of arr) {
                      if (!globalSeen.has(e.id)) {
                        globalSeen.add(e.id);
                        newEvents.push(e);
                      }
                    }
                    // Only add new events to seenMap
                    for (const e of newEvents) {
                      seenMap.set(e.id, e);
                    }
                    emitMerged(isComplete);
                  },
                  relaySet: chosenRelaySet,
                  abortSignal
                });
              })
            );
            emitMerged(true);
          } else {
            await subscribeAndStream(filters.search ? { ...filters, limit: undefined } : { kinds: effectiveKinds, authors: [pubkey] }, {
              timeoutMs: streamingOptions?.timeoutMs || 30000,
              maxResults: streamingOptions?.maxResults || 1000,
              onResults: (arr, isComplete) => {
                for (const e of arr) { if (!seenMap.has(e.id)) seenMap.set(e.id, e); }
                emitMerged(isComplete);
              },
              relaySet: chosenRelaySet,
              abortSignal
            });
          }
        } else {
          await subscribeAndStream(filters.search ? { ...filters, limit: undefined } : { kinds: effectiveKinds, authors: [pubkey] }, {
            timeoutMs: streamingOptions?.timeoutMs || 30000,
            maxResults: streamingOptions?.maxResults || 1000,
            onResults: (arr, isComplete) => {
              for (const e of arr) { if (!seenMap.has(e.id)) seenMap.set(e.id, e); }
              emitMerged(isComplete);
            },
            relaySet: chosenRelaySet,
            abortSignal
          });
        }
        res = Array.from(seenMap.values());

        // In streaming mode, return immediately without non-streaming fallbacks
        const dedupe = new Map<string, NDKEvent>();
        for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
        const finalResults = sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
        return finalResults;
      } else {
        if (terms) {
          const seedExpansions3 = expandParenthesizedOr(terms);
          if (seedExpansions3.length > 1) {
            const seen = new Set<string>();
            for (const seed of seedExpansions3) {
              try {
                const f: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], search: buildSearchQueryWithExtensions(seed, nip50Extensions), limit: Math.max(limit, 200) };
                const r = await subscribeAndStream(f, { timeoutMs: 8000, maxResults: Math.max(limit, 200), relaySet: chosenRelaySet, abortSignal });
                for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
              } catch {}
            }
          } else {
            res = await subscribeAndStream(filters, { timeoutMs: 8000, maxResults: Math.max(limit, 200), relaySet: chosenRelaySet, abortSignal });
          }
        } else {
          res = await subscribeAndStream(filters, { timeoutMs: 8000, maxResults: Math.max(limit, 200), relaySet: chosenRelaySet, abortSignal });
        }
      }

      // If the remaining terms contain parenthesized OR seeds like (a OR b), run a seeded OR search too
      const seedMatches = Array.from(terms.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
      const seedTerms: string[] = [];
      for (const m of seedMatches) {
        const inner = (m[1] || '').trim();
        if (!inner) continue;
        inner.split(/\s+OR\s+/i).forEach((t) => {
          const token = t.trim();
          if (token) seedTerms.push(token);
        });
      }
      if (seedTerms.length > 0) {
        try {
          const seeded = await searchByAnyTerms(seedTerms, limit, chosenRelaySet, abortSignal, nip50Extensions, { authors: [pubkey], kinds: effectiveKinds });
          res = [...res, ...seeded];
        } catch {}
      }
      // Fallback: if no results, try a broader relay set (default + search)
      const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
      const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
      if (res.length === 0) {
        res = await subscribeAndStream(filters, { timeoutMs: 10000, maxResults: Math.max(limit, 200), relaySet: broadRelaySet, abortSignal });
      }
      // Additional fallback for very short terms (e.g., "GM") or stubborn empties:
      // some relays require >=3 chars for NIP-50 search; fetch author-only and filter client-side
      const termStr = terms.trim();
      const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
      if (res.length === 0 && termStr) {
        const authorOnly = await subscribeAndStream({ kinds: effectiveKinds, authors: [pubkey] }, { timeoutMs: 10000, maxResults: Math.max(limit, 600), relaySet: broadRelaySet, abortSignal });
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      } else if (res.length === 0 && hasShortToken) {
        const authorOnly = await subscribeAndStream({ kinds: effectiveKinds, authors: [pubkey] }, { timeoutMs: 10000, maxResults: Math.max(limit, 600), relaySet: broadRelaySet, abortSignal });
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      }
      // Dedupe
      const dedupe = new Map<string, NDKEvent>();
      for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
      const mergedResults = Array.from(dedupe.values());
      // Do not enforce additional client-side text match; rely on relay-side search

      return sortEventsNewestFirst(mergedResults).slice(0, limit);
    }
  }
  
  // Regular search without author filter
  try {
    let results: NDKEvent[] = [];
    const baseSearch = options?.exact ? `"${cleanedQuery}"` : cleanedQuery || undefined;
    const searchQuery = baseSearch ? buildSearchQueryWithExtensions(baseSearch, nip50Extensions) : undefined;
    results = isStreaming 
      ? await subscribeAndStream({
          kinds: effectiveKinds,
          search: searchQuery
        }, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: chosenRelaySet,
          abortSignal
        })
      : await subscribeAndStream({ kinds: effectiveKinds, search: searchQuery }, { timeoutMs: 8000, maxResults: Math.max(limit, 200), relaySet: chosenRelaySet, abortSignal });
    if (isStreaming) {
      console.log('Streaming completed:', {
        query: cleanedQuery,
        finalCount: results.length
      });
    } else {
      console.log('Search results (non-streaming):', {
        query: cleanedQuery,
        resultCount: results.length
      });
    }
    
    // Enforce AND: must match text and contain requested media
    const filtered = results.filter((e, idx, arr) => {
      // dedupe by id while mapping
      const firstIdx = arr.findIndex((x) => x.id === e.id);
      return firstIdx === idx;
    });

    return sortEventsNewestFirst(filtered).slice(0, limit);
  } catch (error) {
    // Treat aborted searches as benign; return empty without logging an error
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
      return [];
    }
    console.error('Error fetching events:', error);
    return [];
  }
}

// Convenience function for streaming search
export async function searchEventsStreaming(
  query: string,
  onResults: (results: NDKEvent[], isComplete: boolean) => void,
  options: {
    maxResults?: number;
    timeoutMs?: number;
    exact?: boolean;
    relaySetOverride?: NDKRelaySet;
    abortSignal?: AbortSignal;
  } = {}
): Promise<NDKEvent[]> {
  return searchEvents(query, 1000, {
    streaming: true,
    onResults,
    maxResults: options.maxResults || 1000,
    timeoutMs: options.timeoutMs || 30000,
    exact: options.exact
  }, options.relaySetOverride, options.abortSignal);
} 