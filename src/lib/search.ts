import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk, connectWithTimeout, markRelayActivity } from './ndk';
import { getStoredPubkey } from './nip07';
import { lookupVertexProfile, searchProfilesFullText, resolveNip05ToPubkey, profileEventFromPubkey } from './vertex';
import { nip19 } from 'nostr-tools';
import { relaySets, RELAYS, getNip50SearchRelaySet } from './relays';
import { getMediaExtsSync } from './search/dsl';

// Type definitions for relay objects
interface RelayObject {
  url?: string;
  relay?: {
    url?: string;
  };
}

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

// Extend filter type to include tag queries for "t" (hashtags)
type TagTFilter = NDKFilter & { '#t'?: string[] };



// Centralized media extension lists (keep DRY)
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'gifs', 'apng', 'webp', 'avif', 'svg'] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'] as const;
export const GIF_EXTENSIONS = ['gif', 'gifs', 'apng'] as const;

const IMAGE_EXT_GROUP = IMAGE_EXTENSIONS.join('|');
const VIDEO_EXT_GROUP = VIDEO_EXTENSIONS.join('|');
const GIF_EXT_GROUP = GIF_EXTENSIONS.join('|');

const IMAGE_URL_PATTERN = `https?:\\/\\/[^\\s'\"<>]+?\\.(?:${IMAGE_EXT_GROUP})`;
const VIDEO_URL_PATTERN = `https?:\\/\\/[^\\s'\"<>]+?\\.(?:${VIDEO_EXT_GROUP})`;
const GIF_URL_PATTERN = `https?:\\/\\/[^\\s'\"<>]+?\\.(?:${GIF_EXT_GROUP})`;

const GIF_URL_REGEX = new RegExp(`(${GIF_URL_PATTERN})(?!\\w)`, 'i');

const IMAGE_URL_REGEX_G = new RegExp(`${IMAGE_URL_PATTERN}(?:[?#][^\\s]*)?`, 'gi');
const VIDEO_URL_REGEX_G = new RegExp(`${VIDEO_URL_PATTERN}(?:[?#][^\\s]*)?`, 'gi');
const GIF_URL_REGEX_G = new RegExp(`${GIF_URL_PATTERN}(?:[?#][^\\s]*)?`, 'gi');

// Use a search-capable relay set explicitly for NIP-50 queries
const searchRelaySet = relaySets.search();

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
  const { timeoutMs = 30000, maxResults = 1000, onResults, relaySet = searchRelaySet, abortSignal } = options;
  
  return new Promise<NDKEvent[]>((resolve) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      resolve([]);
      return;
    }

    // Validate filter
    if (!filter || Object.keys(filter).length === 0) {
      console.warn('Empty filter passed to subscribeAndStream, returning empty results');
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

    const sub = ndk.subscribe([streamingFilter], { 
      closeOnEose: false, // Keep connection open!
      cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, 
      relaySet 
    });

    const timer = setTimeout(() => {
      isComplete = true;
      try { sub.stop(); } catch {}
      // Final emit before resolving
      if (onResults) {
        onResults(Array.from(collected.values()), true);
      }
      resolve(Array.from(collected.values()));
    }, timeoutMs);

    // Handle abort signal
    const abortHandler = () => {
      isComplete = true;
      try { sub.stop(); } catch {}
      clearTimeout(timer);
      if (abortSignal) {
        try { abortSignal.removeEventListener('abort', abortHandler); } catch {}
      }
      if (onResults) {
        onResults(Array.from(collected.values()), true);
      }
      resolve(Array.from(collected.values()));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }

    // Periodic emission of results
    const emitResults = () => {
      if (onResults && !isComplete) {
        const now = Date.now();
        if (now - lastEmitTime >= emitInterval) {
          onResults(Array.from(collected.values()), false);
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
          if (onResults) {
            onResults(Array.from(collected.values()), true);
          }
          resolve(Array.from(collected.values()));
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

async function subscribeAndCollect(filter: NDKFilter, timeoutMs: number = 8000, relaySet: NDKRelaySet = searchRelaySet, abortSignal?: AbortSignal): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      resolve([]);
      return;
    }

    // Validate filter - ensure it has at least one meaningful property
    if (!filter || Object.keys(filter).length === 0) {
      console.warn('Empty filter passed to subscribeAndCollect, returning empty results');
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

    const sub = ndk.subscribe([filter], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet });
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
        eventWithSource.relaySource = relayUrl;
        eventWithSource.relaySources = [relayUrl];
        collected.set(event.id, eventWithSource);
      } else {
        // Event already exists, add this relay to the sources
        const existingEvent = collected.get(event.id) as NDKEventWithRelaySource;
        if (existingEvent.relaySources && !existingEvent.relaySources.includes(relayUrl)) {
          existingEvent.relaySources.push(relayUrl);
        }
      }
    });

    sub.on('eose', () => {
      clearTimeout(timer);
      if (abortSignal) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
      resolve(Array.from(collected.values()));
    });

    sub.start();
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
        kinds: [1],
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
      const sub = ndk.subscribe([{ kinds: [10002], authors: [pubkey], limit: 3 }], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY });
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

function eventHasImage(event?: NDKEvent): boolean {
  if (!event || !event.content) return false;
  return (event.content.match(IMAGE_URL_REGEX_G) || []).length > 0;
}

function eventHasVideo(event?: NDKEvent): boolean {
  if (!event || !event.content) return false;
  return (event.content.match(VIDEO_URL_REGEX_G) || []).length > 0;
}

function eventHasGif(event?: NDKEvent): boolean {
  if (!event || !event.content) return false;
  return (event.content.match(GIF_URL_REGEX_G) || []).length > 0;
}

function stripAllMediaUrls(text: string): string {
  return text
    .replace(IMAGE_URL_REGEX_G, '')
    .replace(VIDEO_URL_REGEX_G, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function eventIsSingleImage(event?: NDKEvent): boolean {
  if (!event || !event.content) return false;
  const imgs = event.content.match(IMAGE_URL_REGEX_G) || [];
  const vids = event.content.match(VIDEO_URL_REGEX_G) || [];
  if (imgs.length !== 1 || vids.length > 0) return false;
  const remaining = stripAllMediaUrls(event.content);
  return remaining.length === 0;
}

function eventIsSingleVideo(event?: NDKEvent): boolean {
  if (!event || !event.content) return false;
  const imgs = event.content.match(IMAGE_URL_REGEX_G) || [];
  const vids = event.content.match(VIDEO_URL_REGEX_G) || [];
  if (vids.length !== 1 || imgs.length > 0) return false;
  const remaining = stripAllMediaUrls(event.content);
  return remaining.length === 0;
}

function eventIsSingleGif(event?: NDKEvent): boolean {
  if (!event || !event.content) return false;
  const allImgs = event.content.match(IMAGE_URL_REGEX_G) || [];
  const gifs = event.content.match(GIF_URL_REGEX_G) || [];
  const otherImgs = allImgs.filter((u) => !GIF_URL_REGEX.test(u));
  const vids = event.content.match(VIDEO_URL_REGEX_G) || [];
  if (gifs.length !== 1 || otherImgs.length > 0 || vids.length > 0) return false;
  const remaining = stripAllMediaUrls(event.content);
  return remaining.length === 0;
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
  const extensionSeeds: string[] = [];
  const extensionFilters: Array<(content: string) => boolean> = [];

  // EARLY: Author filter handling (resolve by:<author> to npub and use authors[] filter)
  const earlyAuthorMatch = extCleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (earlyAuthorMatch) {
    const [, author] = earlyAuthorMatch;
    const terms = extCleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();
    console.log('Found author filter (early):', { author, terms });

    let pubkey: string | null = null;
    if (isNpub(author)) {
      try { pubkey = getPubkey(author); } catch { pubkey = null; }
    } else {
      try {
        let profile = await lookupVertexProfile(`p:${author}`);
        if (!profile) {
          try { const profiles = await searchProfilesFullText(author, 1); profile = profiles[0] || null; } catch {}
        }
        if (profile) pubkey = profile.author?.pubkey || profile.pubkey || null;
      } catch {}
    }

    if (!pubkey) {
      console.log('No valid pubkey found for author:', author);
      return [];
    }

    const filters: NDKFilter = { kinds: [1], authors: [pubkey], limit: Math.max(limit, 200) };
    if (terms) filters.search = buildSearchQueryWithExtensions(terms, nip50Extensions);

    console.log('Searching with filters (early author):', filters);
    let res: NDKEvent[] = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
    const seedMatches = Array.from(terms.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
    const seedTerms: string[] = [];
    for (const m of seedMatches) {
      const inner = (m[1] || '').trim();
      if (!inner) continue;
      inner.split(/\s+OR\s+/i).forEach((t) => { const token = t.trim(); if (token) seedTerms.push(token); });
    }
    if (seedTerms.length > 0) {
      try { const seeded = await searchByAnyTerms(seedTerms, limit, chosenRelaySet, abortSignal, nip50Extensions, { authors: [pubkey] }); res = [...res, ...seeded]; } catch {}
    }
    const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
    const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
    if (res.length === 0) { res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal); }
    const termStr = terms.trim();
    const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
    if (res.length === 0 && termStr) {
      const authorOnly = await subscribeAndCollect({ kinds: [1], authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
      const needle = termStr.toLowerCase();
      res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
    } else if (res.length === 0 && hasShortToken) {
      const authorOnly = await subscribeAndCollect({ kinds: [1], authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
      const needle = termStr.toLowerCase();
      res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
    }
    const dedupe = new Map<string, NDKEvent>();
    for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
    return Array.from(dedupe.values()).slice(0, limit);
  }

  // Check for OR operator
  const orParts = parseOrQuery(extCleanedQuery);
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
        console.error(`Error processing OR query part "${part}":`, error);
      }
    }
    
    // Sort by creation time (newest first) and limit results
    let merged = allResults;
    return merged
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  }

  // URL search: always do exact (literal) match for http(s) URLs
  try {
    const url = new URL(extCleanedQuery);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const searchQuery = buildSearchQueryWithExtensions(`"${extCleanedQuery}"`, nip50Extensions);
      const results = isStreaming 
        ? await subscribeAndStream({
            kinds: [1],
            search: searchQuery
          }, {
            timeoutMs: streamingOptions?.timeoutMs || 30000,
            maxResults: streamingOptions?.maxResults || 1000,
            onResults: streamingOptions?.onResults,
            relaySet: chosenRelaySet,
            abortSignal
          })
        : await subscribeAndCollect({
            kinds: [1],
            search: searchQuery,
            limit: Math.max(limit, 200)
          }, 8000, chosenRelaySet, abortSignal);
      let res = results;
      return res.slice(0, limit);
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
        const byId = await subscribeAndCollect({ ids: [data.id], limit: 1 }, 8000, rs, abortSignal);
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
        const byId = await subscribeAndCollect({ ids: [id], limit: 1 }, 8000, rs, abortSignal);
        if (byId.length > 0) return byId;
      }
      return [];
    }
  } catch {}

  // Pure hashtag search: use tag-based filter across broad relay set (no NIP-50 required)
  const hashtagMatches = extCleanedQuery.match(/#[A-Za-z0-9_]+/g) || [];
  const nonHashtagRemainder = extCleanedQuery.replace(/#[A-Za-z0-9_]+/g, '').trim();
  if (hashtagMatches.length > 0 && nonHashtagRemainder.length === 0) {
    const tags = Array.from(new Set(hashtagMatches.map((h) => h.slice(1).toLowerCase())));
    const tagFilter: TagTFilter = { kinds: [1], '#t': tags, limit: Math.max(limit, 500) };

    // Broader relay set than NIP-50 search: default + search relays
    const broadRelays = Array.from(
      new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH].map((u) => u as string))
    );
    const tagRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);

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
    return final
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  }

  // Full-text profile search `p:<term>` (not only username)
  const fullProfileMatch = extCleanedQuery.match(/^p:(.+)$/i);
  if (fullProfileMatch) {
    const term = (fullProfileMatch[1] || '').trim();
    if (!term) return [];
    try {
      const profiles = await searchProfilesFullText(term, 21);
      return profiles;
    } catch (error) {
      console.warn('Full-text profile search failed:', error);
      return [];
    }
  }

  // Check if the query is a direct npub
  if (isNpub(extCleanedQuery)) {
    try {
      const pubkey = getPubkey(extCleanedQuery);
      if (!pubkey) return [];

      return await subscribeAndCollect({
        kinds: [1],
        authors: [pubkey],
        limit: Math.max(limit, 200)
      }, 8000, chosenRelaySet, abortSignal);
    } catch (error) {
      console.error('Error processing npub query:', error);
      return [];
    }
  }

  // NIP-05 resolution: '@name@domain' or 'domain.tld' or '@domain.tld'
  const nip05Like = extCleanedQuery.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
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
  const authorMatch = extCleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (authorMatch) {
    const [, author] = authorMatch;
    // Extract search terms by removing the author filter
    const terms = extCleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();
    console.log('Found author filter:', { author, terms });

    let pubkey: string | null = null;

    // Check if author is a direct npub
    if (isNpub(author)) {
      try {
        pubkey = getPubkey(author);
      } catch (error) {
        console.error('Error decoding author npub:', error);
        pubkey = null;
      }
    } else {
      // Look up author's profile via Vertex DVM (personalized when logged in, global otherwise)
      try {
        let profile = await lookupVertexProfile(`p:${author}`);
        // Fallback: try full-text profile search if DVM and fallback did not return a result
        if (!profile) {
          try {
            const profiles = await searchProfilesFullText(author, 1);
            profile = profiles[0] || null;
          } catch {
            // ignore and keep profile null
          }
        }
        if (profile) {
          pubkey = profile.author?.pubkey || profile.pubkey || null;
        }
      } catch (error) {
        console.error('Error looking up author profile:', error);
      }
    }

    if (!pubkey) {
      console.log('No valid pubkey found for author:', author);
      return [];
    }

    const filters: NDKFilter = {
      kinds: [1],
      authors: [pubkey],
      limit: Math.max(limit, 200)
    };

    // Add search term to the filter if present
    if (terms) {
      filters.search = buildSearchQueryWithExtensions(terms, nip50Extensions);
      // Increase limit for filtered text searches to improve recall
      // Many relays require higher limits to surface matching events
      filters.limit = Math.max(limit, 200);
    }

    // No additional post-filtering; use default limits

    console.log('Searching with filters:', filters);
    {
      // Fetch by base terms if any, restricted to author
      let res: NDKEvent[] = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);

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
          const seeded = await searchByAnyTerms(seedTerms, limit, chosenRelaySet, abortSignal, nip50Extensions, { authors: [pubkey] });
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
        const authorOnly = await subscribeAndCollect({ kinds: [1], authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      } else if (res.length === 0 && hasShortToken) {
        const authorOnly = await subscribeAndCollect({ kinds: [1], authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      }
      let mergedResults: NDKEvent[] = res;
      // Dedupe
      const dedupe = new Map<string, NDKEvent>();
      for (const e of mergedResults) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
      mergedResults = Array.from(dedupe.values());
      // Do not enforce additional client-side text match; rely on relay-side search
      let filtered = mergedResults;
      
      return filtered.slice(0, limit);
    }
  }
  
  // Regular search without author filter
  try {
    let results: NDKEvent[] = [];
    const baseSearch = options?.exact ? `"${extCleanedQuery}"` : extCleanedQuery || undefined;
    const searchQuery = baseSearch ? buildSearchQueryWithExtensions(baseSearch, nip50Extensions) : undefined;
    results = isStreaming 
      ? await subscribeAndStream({
          kinds: [1],
          search: searchQuery
        }, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: chosenRelaySet,
          abortSignal
        })
      : await subscribeAndCollect({ kinds: [1], search: searchQuery, limit: Math.max(limit, 200) }, 8000, chosenRelaySet, abortSignal);
    console.log('Search results:', {
      query: extCleanedQuery,
      resultCount: results.length
    });
    
    // Enforce AND: must match text and contain requested media
    let filtered = results.filter((e, idx, arr) => {
      // dedupe by id while mapping
      const firstIdx = arr.findIndex((x) => x.id === e.id);
      return firstIdx === idx;
    });
    
    return filtered.slice(0, limit);
  } catch (error) {
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