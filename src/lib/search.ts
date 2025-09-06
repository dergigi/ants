import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { getStoredPubkey } from './nip07';
import { lookupVertexProfile, searchProfilesFullText, resolveNip05ToPubkey, profileEventFromPubkey } from './vertex';
import { nip19 } from 'nostr-tools';
import { relaySets, RELAYS } from './relays';

// Type definitions for relay objects
interface RelayObject {
  url?: string;
  relay?: {
    url?: string;
  };
}

interface NDKEventWithRelaySource extends NDKEvent {
  relaySource?: string;
}



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

// Extract relay filters from the raw query string
function extractRelayFilters(rawQuery: string): { cleaned: string; relayUrls: string[]; useMyRelays: boolean } {
  let cleaned = rawQuery;
  const relayUrls: string[] = [];
  let useMyRelays = false;

  // relay:<host-or-url>
  const relayRegex = /(?:^|\s)relay:([^\s]+)(?:\s|$)/gi;
  cleaned = cleaned.replace(relayRegex, (_, hostOrUrl: string) => {
    const value = (hostOrUrl || '').trim();
    if (value) relayUrls.push(value);
    return ' ';
  });

  // relays:mine
  const relaysMineRegex = /(?:^|\s)relays:mine(?:\s|$)/gi;
  if (relaysMineRegex.test(cleaned)) {
    useMyRelays = true;
    cleaned = cleaned.replace(relaysMineRegex, ' ');
  }

  // Normalize relay URLs
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const r of relayUrls) {
    const hasScheme = /^wss?:\/\//i.test(r);
    const url = hasScheme ? r : `wss://${r}`;
    if (!seen.has(url)) {
      seen.add(url);
      normalized.push(url);
    }
  }

  return { cleaned: cleaned.trim(), relayUrls: normalized, useMyRelays };
}

async function subscribeAndCollect(filter: NDKFilter, timeoutMs: number = 8000, relaySet: NDKRelaySet = searchRelaySet, abortSignal?: AbortSignal): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve, reject) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      reject(new Error('Search aborted'));
      return;
    }

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
      reject(new Error('Search aborted'));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }

    sub.on('event', (event: NDKEvent, relay: NDKRelay | undefined) => {
      if (!collected.has(event.id)) {
        // Add relay source info to the event
        const relayUrl = relay?.url || 'unknown';
        (event as NDKEventWithRelaySource).relaySource = relayUrl;
        collected.set(event.id, event);
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

async function searchByAnyTerms(terms: string[], limit: number, relaySet: NDKRelaySet, abortSignal?: AbortSignal): Promise<NDKEvent[]> {
  // Run independent NIP-50 searches for each term and merge results (acts like boolean OR)
  const seen = new Set<string>();
  const merged: NDKEvent[] = [];
  for (const term of terms) {
    try {
      const res = await subscribeAndCollect({ kinds: [1], search: term, limit: Math.max(limit, 200) }, 8000, relaySet, abortSignal);
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
    const [name, domain] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
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

export async function searchEvents(
  query: string,
  limit: number = 200,
  options?: { exact?: boolean },
  relaySetOverride?: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  // Check if already aborted
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Ensure we're connected before issuing any queries (with timeout)
  try {
    // Attempt connection with timeout - NDK handles duplicate connections gracefully
    await Promise.race([
      ndk.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 3000))
    ]);
  } catch (e) {
    console.warn('NDK connect failed or timed out:', e);
    // Continue anyway - search might still work with cached connections
  }

  // Check if aborted after connection
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Extract relay filters and prepare relay set
  const relayExtraction = extractRelayFilters(query);
  const relayCandidates: string[] = [];
  if (!relaySetOverride) {
    if (relayExtraction.useMyRelays) {
      const mine = await getUserRelayUrls();
      for (const u of mine) relayCandidates.push(u);
    }
    for (const u of relayExtraction.relayUrls) relayCandidates.push(u);
  }
  const chosenRelaySet: NDKRelaySet = relaySetOverride
    ? relaySetOverride
    : (relayCandidates.length > 0
      ? NDKRelaySet.fromRelayUrls(Array.from(new Set(relayCandidates)), ndk)
      : searchRelaySet);
  if (relayCandidates.length > 0) {
    console.log('Using relay candidates for search:', Array.from(new Set(relayCandidates)));
  } else if (!relaySetOverride) {
    console.log('Using default search relay set:', RELAYS.SEARCH);
  } else {
    console.log('Using provided relay set override');
  }

  // Detect and strip media flags; apply post-filter later
  const relayStripped = relayExtraction.cleaned;
  const hasImageFlag = /(?:^|\s)has:images?(?:\s|$)/i.test(relayStripped);
  const hasVideoFlag = /(?:^|\s)has:videos?(?:\s|$)/i.test(relayStripped);
  const hasGifFlag = /(?:^|\s)has:gifs?(?:\s|$)/i.test(relayStripped);
  const isImageFlag = /(?:^|\s)is:image(?:\s|$)/i.test(relayStripped);
  const isVideoFlag = /(?:^|\s)is:video(?:\s|$)/i.test(relayStripped);
  const isGifFlag = /(?:^|\s)is:gif(?:\s|$)/i.test(relayStripped);
  const cleanedQuery = relayStripped
    .replace(/(?:^|\s)has:images?(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)has:videos?(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)has:gifs?(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)is:image(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)is:video(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)is:gif(?:\s|$)/gi, ' ')
    .trim();

  // Check for OR operator
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
        console.error(`Error processing OR query part "${part}":`, error);
      }
    }
    
    // Sort by creation time (newest first) and limit results
    let merged = allResults;
    if (hasImageFlag) merged = merged.filter(eventHasImage);
    if (hasVideoFlag) merged = merged.filter(eventHasVideo);
    if (hasGifFlag) merged = merged.filter(eventHasGif);
    if (isImageFlag) merged = merged.filter(eventIsSingleImage);
    if (isVideoFlag) merged = merged.filter(eventIsSingleVideo);
    if (isGifFlag) merged = merged.filter(eventIsSingleGif);
    return merged
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  }

  // URL search: always do exact (literal) match for http(s) URLs
  try {
    const url = new URL(cleanedQuery);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const results = await subscribeAndCollect({
        kinds: [1],
        search: `"${cleanedQuery}"`,
        limit: Math.max(limit, 200)
      }, 8000, chosenRelaySet, abortSignal);
      let res = results;
      if (hasImageFlag) res = res.filter(eventHasImage);
      if (hasVideoFlag) res = res.filter(eventHasVideo);
      if (hasGifFlag) res = res.filter(eventHasGif);
      if (isImageFlag) res = res.filter(eventIsSingleImage);
      if (isVideoFlag) res = res.filter(eventIsSingleVideo);
      if (isGifFlag) res = res.filter(eventIsSingleGif);
      return res.slice(0, limit);
    }
  } catch {}

  // Full-text profile search `p:<term>` (not only username)
  const fullProfileMatch = cleanedQuery.match(/^p:(.+)$/i);
  if (fullProfileMatch) {
    const term = (fullProfileMatch[1] || '').trim();
    if (!term) return [];
    try {
      const profiles = await searchProfilesFullText(term, 21);
      return profiles;
    } catch (e) {
      console.warn('Full-text profile search failed:', e);
      return [];
    }
  }

  // Check if the query is a direct npub
  if (isNpub(cleanedQuery)) {
    try {
      const pubkey = getPubkey(cleanedQuery);
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
  const authorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/);
  if (authorMatch) {
    const [, author] = authorMatch;
    // Extract search terms by removing the author filter
    const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/, '').trim();
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
        const profile = await lookupVertexProfile(`p:${author}`);
        if (profile) {
          pubkey = profile.author.pubkey;
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
      filters.search = terms;
      // Increase limit for filtered text searches to improve recall
      // Many relays require higher limits to surface matching events
      filters.limit = Math.max(limit, 200);
    }

    // Increase limit when we post-filter for media
    if (hasImageFlag || hasVideoFlag || hasGifFlag || isImageFlag || isVideoFlag || isGifFlag) {
      filters.limit = Math.max(filters.limit || limit, 200);
    }

    console.log('Searching with filters:', filters);
    {
      const res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
      let filtered = res;
      if (hasImageFlag) filtered = filtered.filter(eventHasImage);
      if (hasVideoFlag) filtered = filtered.filter(eventHasVideo);
      if (hasGifFlag) filtered = filtered.filter(eventHasGif);
      if (isImageFlag) filtered = filtered.filter(eventIsSingleImage);
      if (isVideoFlag) filtered = filtered.filter(eventIsSingleVideo);
      if (isGifFlag) filtered = filtered.filter(eventIsSingleGif);
      return filtered.slice(0, limit);
    }
  }
  
  // Regular search without author filter
  try {
    const imgTerms = [...IMAGE_EXTENSIONS];
    const vidTerms = [...VIDEO_EXTENSIONS];

    let results: NDKEvent[] = [];

    // Seed search: if media flags present, OR-merge per extension, then post-filter to enforce AND semantics
    const mediaFlagsPresent = hasImageFlag || isImageFlag || hasVideoFlag || isVideoFlag || hasGifFlag || isGifFlag;
    if (mediaFlagsPresent) {
      const terms: string[] = hasGifFlag || isGifFlag ? [...GIF_EXTENSIONS] : (hasVideoFlag || isVideoFlag) ? vidTerms : imgTerms;
      const seedResults = await searchByAnyTerms(terms, limit, chosenRelaySet, abortSignal);
      const baseQueryResults = cleanedQuery ? await subscribeAndCollect({ kinds: [1], search: cleanedQuery, limit: Math.max(limit, 200) }, 8000, chosenRelaySet, abortSignal) : [];
      results = [...seedResults, ...baseQueryResults];
    } else {
      const baseSearch = options?.exact ? `"${cleanedQuery}"` : cleanedQuery || undefined;
      results = await subscribeAndCollect({ kinds: [1], search: baseSearch, limit: Math.max(limit, 200) }, 8000, chosenRelaySet, abortSignal);
    }
    console.log('Search results:', {
      query: cleanedQuery,
      resultCount: results.length
    });
    
    // Enforce AND: must match text and contain requested media
    let filtered = results.filter((e, idx, arr) => {
      // dedupe by id while mapping
      const firstIdx = arr.findIndex((x) => x.id === e.id);
      return firstIdx === idx;
    });
    if (hasImageFlag) filtered = filtered.filter(eventHasImage);
    if (hasVideoFlag) filtered = filtered.filter(eventHasVideo);
    if (hasGifFlag) filtered = filtered.filter(eventHasGif);
    if (isImageFlag) filtered = filtered.filter(eventIsSingleImage);
    if (isVideoFlag) filtered = filtered.filter(eventIsSingleVideo);
    if (isGifFlag) filtered = filtered.filter(eventIsSingleGif);
    return filtered.slice(0, limit);
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
} 