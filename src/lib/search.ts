import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk, connectWithTimeout, markRelayActivity, safeSubscribe, isValidFilter } from './ndk';
import { getStoredPubkey } from './nip07';
import { searchProfilesFullText, resolveNip05ToPubkey, profileEventFromPubkey, resolveAuthor } from './vertex';
import { nip19 } from 'nostr-tools';
import { relaySets as predefinedRelaySets, RELAYS, getNip50SearchRelaySet } from './relays';
import { getUserRelayAdditions } from './storage';
import { normalizeRelayUrl } from './urlUtils';
// legacy import removed

// Type definitions for relay objects
interface RelayObject {
  url?: string;
  relay?: {
    url?: string;
  };
}

// Import shared utilities
import { 
  Nip50Extensions, 
  buildSearchQueryWithExtensions
} from './search/searchUtils';
import { sortEventsNewestFirst } from './utils/searchUtils';

interface NDKEventWithRelaySource extends NDKEvent {
  relaySource?: string;
  relaySources?: string[]; // Track all relays where this event was found
}


// Extend filter type to include tag queries for "t" (hashtags) and "a" (replaceable events)
type TagTFilter = NDKFilter & { '#t'?: string[]; '#a'?: string[] };



// Centralized media extension lists (keep DRY)
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'gifs', 'apng', 'webp', 'avif', 'svg'] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'] as const;
export const GIF_EXTENSIONS = ['gif', 'gifs', 'apng'] as const;


// Use a search-capable relay set explicitly for NIP-50 queries (lazy, async)
let searchRelaySetPromise: Promise<NDKRelaySet> | null = null;
async function getSearchRelaySet(): Promise<NDKRelaySet> {
  if (!searchRelaySetPromise) searchRelaySetPromise = predefinedRelaySets.search();
  return searchRelaySetPromise;
}

async function getBroadRelaySet(): Promise<NDKRelaySet> {
  const union = new Set<string>([
    ...RELAYS.DEFAULT,
    ...RELAYS.SEARCH,
    ...getUserRelayAdditions()
  ]);
  return NDKRelaySet.fromRelayUrls(Array.from(union), ndk);
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
export async function subscribeAndStream(
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

    console.log('subscribeAndStream called with filter:', filter);

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
      const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
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
      const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
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
          const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
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
          const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
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

export async function subscribeAndCollect(filter: NDKFilter, timeoutMs: number = 8000, relaySet?: NDKRelaySet, abortSignal?: AbortSignal): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      resolve([]);
      return;
    }

    // Validate filter - ensure it has at least one meaningful property
    if (!isValidFilter(filter)) {
      console.warn('Invalid filter passed to subscribeAndCollect, returning empty results');
      resolve([]);
      return;
    }

    // Debug: log the filter being used
    console.log('subscribeAndCollect called with filter:', filter);

    const collected: Map<string, NDKEvent> = new Map();

    // Debug: which relays are we querying?
    try {
      const relaysContainer = (relaySet as unknown as { relays?: unknown; relayUrls?: unknown }).relays ?? 
                             (relaySet as unknown as { relayUrls?: unknown }).relayUrls;
      const relayEntries: RelayObject[] = Array.isArray(relaysContainer)
        ? relaysContainer
        : relaysContainer && (relaysContainer instanceof Set || relaysContainer instanceof Map)
          ? Array.from((relaysContainer as Set<RelayObject> | Map<string, RelayObject>).values?.() ?? relaysContainer)
          : [];
      const relayUrls = relayEntries
        .map((r: RelayObject) => r?.url || r?.relay?.url || r)
        .filter((u: unknown): u is string => typeof u === 'string');
      console.log('Subscribing with filter on relays:', { relayUrls, filter });
    } catch {}

    (async () => {
      const rs = relaySet || await getSearchRelaySet();
      const sub = safeSubscribe([filter], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet: rs });
    
      if (!sub) {
        console.warn('Failed to create subscription in subscribeAndCollect');
        resolve([]);
        return;
      }
    const timer = setTimeout(() => {
      try { sub.stop(); } catch {}
      resolve(Array.from(collected.values()));
    }, timeoutMs);

    // Handle abort signal
    const abortHandler = () => {
      try { sub.stop(); } catch {}
      clearTimeout(timer);
      if (abortSignal) {
        try { abortSignal.removeEventListener('abort', abortHandler); } catch {}
      }
      // Resolve with whatever we have so far (partial results) instead of rejecting
      resolve(Array.from(collected.values()));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }

      sub.on('event', (event: NDKEvent, relay: NDKRelay | undefined) => {
      const relayUrl = relay?.url || 'unknown';
      
      // Mark this relay as active for robust connection status
      if (relayUrl !== 'unknown') {
        try { markRelayActivity(relayUrl); } catch {}
      }
      
      if (!collected.has(event.id)) {
        // First time seeing this event
        const eventWithSource = event as NDKEventWithRelaySource;
        const normalizedUrl = normalizeRelayUrl(relayUrl);
        eventWithSource.relaySource = normalizedUrl;
        eventWithSource.relaySources = [normalizedUrl];
        collected.set(event.id, eventWithSource);
      } else {
        // Event already exists, add this relay to the sources
        const existingEvent = collected.get(event.id) as NDKEventWithRelaySource;
        const normalizedUrl = normalizeRelayUrl(relayUrl);
        if (existingEvent.relaySources && !existingEvent.relaySources.includes(normalizedUrl)) {
          existingEvent.relaySources.push(normalizedUrl);
        }
      }
    });

      sub.on('eose', (relay: NDKRelay | undefined) => {
        clearTimeout(timer);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        resolve(Array.from(collected.values()));
      });

      sub.start();
    })();
  });
}

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
        kinds: [1, 9802], // Include highlights (NIP-84)
        ...(baseFilter || {}),
        search: searchQuery,
        limit: Math.max(limit, 200)
      };
      const res = await subscribeAndCollect(filter, 8000, relaySet, abortSignal);
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

export async function getUserRelayUrls(timeoutMs: number = 6000): Promise<string[]> {
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
  // Check if it's a valid npub: starts with npub1, contains only valid bech32 characters, and reasonable length
  return /^npub1[0-9a-z]+$/i.test(str) && str.length > 10;
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

function sanitizeRelayUrls(relays: unknown): string[] {
  if (!Array.isArray(relays)) return [];
  const normalized = relays
    .filter((r: unknown): r is string => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim())
    .map((r) => (/^wss?:\/\//i.test(r) ? r : `wss://${r}`));
  return Array.from(new Set(normalized));
}

async function fetchEventByIdentifier(
  options: {
    id?: string;
    filter?: NDKFilter;
    relayHints?: string[];
  },
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  const { id, filter, relayHints } = options;
  const baseFilter = filter || (id ? { ids: [id], limit: 1 } : undefined);
  if (!baseFilter) return [];


  const relaySetsToTry: NDKRelaySet[] = [];
  const hinted = sanitizeRelayUrls(relayHints);
  if (hinted.length > 0) {
    relaySetsToTry.push(NDKRelaySet.fromRelayUrls(hinted, ndk));
  }
  relaySetsToTry.push(await predefinedRelaySets.default());
  relaySetsToTry.push(await getSearchRelaySet());

  for (const rs of relaySetsToTry) {
    const events = await subscribeAndCollect(baseFilter as NDKFilter, 8000, rs, abortSignal);
    if (events.length > 0) return events;
  }
  return [];
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

  // Check if this is a streaming search
  const isStreaming = options && 'streaming' in options && options.streaming;
  const streamingOptions = isStreaming ? options as StreamingSearchOptions : undefined;

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
    : [1, 9802]; // Include highlights (NIP-84) by default
  const extensionFilters: Array<(content: string) => boolean> = [];

  // Distribute parenthesized OR seeds across the entire query BEFORE any specialized handling
  // e.g., "(GM OR GN) by:dergigi" => ["GM by:dergigi", "GN by:dergigi"]
  {
    const expandedSeeds = expandParenthesizedOr(cleanedQuery);
    if (expandedSeeds.length > 1) {
      const merged: NDKEvent[] = [];
      const seen = new Set<string>();
      for (const seed of expandedSeeds) {
        try {
          const partResults = await searchEvents(seed, limit, options, chosenRelaySet, abortSignal);
          for (const evt of partResults) {
            if (!seen.has(evt.id)) { seen.add(evt.id); merged.push(evt); }
          }
        } catch (error) {
          if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
            // no-op
          } else {
            console.warn('Expanded seed failed:', seed, error);
          }
        }
      }
      return sortEventsNewestFirst(merged).slice(0, limit);
    }
  }

  // EARLY: Author filter handling (resolve by:<author> to npub and use authors[] filter)
  const earlyAuthorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (earlyAuthorMatch) {
    const [, author] = earlyAuthorMatch;
    const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();
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

    console.log('Searching with filters (early author):', filters);
    let res: NDKEvent[] = [];
    if (terms && seedExpansions.length > 1) {
      // Run each expansion and merge
      const seen = new Set<string>();
      for (const seed of seedExpansions) {
        try {
          const f: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], search: buildSearchQueryWithExtensions(seed, nip50Extensions), limit: Math.max(limit, 200) };
          const r = await subscribeAndCollect(f, 8000, chosenRelaySet, abortSignal);
          for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
        } catch {}
      }
    } else {
      res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
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
    if (res.length === 0) { res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal); }
    const termStr = terms.trim();
    const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
    if (res.length === 0 && termStr) {
      const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
      const needle = termStr.toLowerCase();
      res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
    } else if (res.length === 0 && hasShortToken) {
      const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
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
    const allResults: NDKEvent[] = [];
    const seenIds = new Set<string>();
    
    // Process each part of the OR query
    for (const part of orParts) {
      try {
        const partResults = await searchEvents(part, limit, options, chosenRelaySet, abortSignal);
        for (const event of partResults) {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            allResults.push(event);
          }
        }
      } catch (error) {
        // Suppress abort errors so they don't bubble to UI as console errors
        if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
          // No-op: benign abort during OR processing
        } else {
          console.error(`Error processing OR query part "${part}":`, error);
        }
      }
    }
    
    // Sort by creation time (newest first) and limit results
    const merged = allResults;
    return sortEventsNewestFirst(merged).slice(0, limit);
  }

  // URL search: strip protocol and search for domain/path content
  try {
    const url = new URL(cleanedQuery);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const { searchUrlEvents } = await import('./search/urlSearch');
      return await searchUrlEvents(
        cleanedQuery,
        effectiveKinds,
        nip50Extensions,
        limit,
        isStreaming || false,
        streamingOptions,
        chosenRelaySet,
        abortSignal
      );
    }
  } catch {}

  // nevent/note bech32: fetch by id (optionally using relays embedded in nevent)
  try {
    const decoded = nip19.decode(extCleanedQuery);
    if (decoded?.type === 'nevent') {
      const data = decoded.data as { id: string; relays?: string[] };
      const results = await fetchEventByIdentifier({ id: data.id, relayHints: data.relays }, abortSignal);
      if (results.length > 0) return results;
      return [];
    }
    if (decoded?.type === 'note') {
      const id = decoded.data as string;
      const results = await fetchEventByIdentifier({ id }, abortSignal);
      if (results.length > 0) return results;
      return [];
    }
    if (decoded?.type === 'naddr') {
      const data = decoded.data as { pubkey: string; identifier: string; kind: number; relays?: string[] };
      const pointerFilter: NDKFilter = {
        kinds: [data.kind],
        authors: [data.pubkey],
        '#d': [data.identifier],
        limit: 1
      };
      const results = await fetchEventByIdentifier({ filter: pointerFilter, relayHints: data.relays }, abortSignal);
      if (results.length > 0) return results;
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
    const tagRelaySet = await getBroadRelaySet();

    const results = isStreaming
      ? await subscribeAndStream(tagFilter, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: tagRelaySet,
          abortSignal
        })
      : await subscribeAndCollect(tagFilter, 10000, tagRelaySet, abortSignal);

    let final = results;
    if (extensionFilters.length > 0) {
      final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
    }
    return sortEventsNewestFirst(final).slice(0, limit);
  }

  // Handle a: tag queries for replaceable events (e.g., a:30023:pubkey:d-tag)
  const aTagMatch = cleanedQuery.match(/^a:(.+)$/i);
  if (aTagMatch) {
    const aTagValue = (aTagMatch[1] || '').trim();
    if (aTagValue) {
      const aTagFilter: TagTFilter = { kinds: effectiveKinds, '#a': [aTagValue], limit: Math.max(limit, 500) };
      
      // Use broader relay set for a tag searches
      const aTagRelaySet = await getBroadRelaySet();

      const results = isStreaming
        ? await subscribeAndStream(aTagFilter, {
            timeoutMs: streamingOptions?.timeoutMs || 30000,
            maxResults: streamingOptions?.maxResults || 1000,
            onResults: streamingOptions?.onResults,
            relaySet: aTagRelaySet,
            abortSignal
          })
        : await subscribeAndCollect(aTagFilter, 10000, aTagRelaySet, abortSignal);

      let final = results;
      if (extensionFilters.length > 0) {
        final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
      }
      return sortEventsNewestFirst(final).slice(0, limit);
    }
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
      const profiles = await searchProfilesFullText(term);
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

      const res = await subscribeAndCollect({
        kinds: effectiveKinds,
        authors: [pubkey],
        limit: Math.max(limit, 200)
      }, 8000, chosenRelaySet, abortSignal);
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
    // Extract search terms by removing the author filter
    const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();
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

    console.log('Searching with filters:', filters);
    {
      // Fetch by base terms if any, restricted to author
      let res: NDKEvent[] = [];
      if (terms) {
        const seedExpansions3 = expandParenthesizedOr(terms);
        if (seedExpansions3.length > 1) {
          const seen = new Set<string>();
          for (const seed of seedExpansions3) {
            try {
              const f: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], search: buildSearchQueryWithExtensions(seed, nip50Extensions), limit: Math.max(limit, 200) };
              const r = await subscribeAndCollect(f, 8000, chosenRelaySet, abortSignal);
              for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
            } catch {}
          }
        } else {
          res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
        }
      } else {
        res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
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
        res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal);
      }
      // Additional fallback for very short terms (e.g., "GM") or stubborn empties:
      // some relays require >=3 chars for NIP-50 search; fetch author-only and filter client-side
      const termStr = terms.trim();
      const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
      if (res.length === 0 && termStr) {
        const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      } else if (res.length === 0 && hasShortToken) {
        const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      }
      let mergedResults: NDKEvent[] = res;
      // Dedupe
      const dedupe = new Map<string, NDKEvent>();
      for (const e of mergedResults) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
      mergedResults = Array.from(dedupe.values());
      // Do not enforce additional client-side text match; rely on relay-side search
      const filtered = mergedResults;
      
      return sortEventsNewestFirst(filtered).slice(0, limit);
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
      : await subscribeAndCollect({ kinds: effectiveKinds, search: searchQuery, limit: Math.max(limit, 200) }, 8000, chosenRelaySet, abortSignal);
    console.log('Search results:', {
      query: cleanedQuery,
      resultCount: results.length
    });
    
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