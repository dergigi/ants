import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { RELAY_NIP50_BEHAVIOR_CACHE_DURATION } from '../constants';
import { getStoredPubkey } from '../nip07';
import { getUserRelayAdditions } from '../storage';
import { RELAYS, createRelaySet } from './config';
import { getRelayInfo } from './infoCache';
import { discoverNip66SearchRelays } from './nip66';
import { extendWithUserAndPremium } from './userDiscovery';

type SearchProbeResult = {
  opened: boolean;
  events: number;
  eose: boolean;
  closed: boolean;
  error: boolean;
};

const NIP50_PROBE_TIMEOUT_MS = 2500;
const NIP50_SANITY_SEARCH = 'nostr';
const nip50BehaviorCache = new Map<string, { supportsSearch: boolean; timestamp: number }>();
const nip50BehaviorInFlight = new Map<string, Promise<boolean>>();
let searchRelayGeneration = 0;

function canProbeRelayBehavior(): boolean {
  return typeof WebSocket !== 'undefined';
}

function probeSearch(relayUrl: string, search: string): Promise<SearchProbeResult> {
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let settled = false;
    let events = 0;
    let opened = false;
    const subId = `ants-nip50-${Math.random().toString(16).slice(2)}`;

    const finish = (result: Omit<SearchProbeResult, 'opened' | 'events'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(['CLOSE', subId]));
      } catch {}
      try { ws?.close(); } catch {}
      resolve({ opened, events, ...result });
    };

    const timer = setTimeout(() => finish({ eose: false, closed: false, error: false }), NIP50_PROBE_TIMEOUT_MS);

    try {
      ws = new WebSocket(relayUrl);
    } catch {
      finish({ eose: false, closed: false, error: true });
      return;
    }

    ws.onopen = () => {
      opened = true;
      ws?.send(JSON.stringify(['REQ', subId, { kinds: [1], search, limit: 1 }]));
    };

    ws.onerror = () => finish({ eose: false, closed: false, error: true });

    ws.onmessage = (message: MessageEvent) => {
      if (typeof message.data !== 'string') return;

      try {
        const data = JSON.parse(message.data) as unknown[];
        if (data[0] === 'EVENT' && data[1] === subId) events += 1;
        if (data[0] === 'EOSE' && data[1] === subId) finish({ eose: true, closed: false, error: false });
        if (data[0] === 'CLOSED' && data[1] === subId) finish({ eose: false, closed: true, error: false });
      } catch {}
    };
  });
}

async function verifiesSearchBehavior(relayUrl: string): Promise<boolean> {
  if (!canProbeRelayBehavior()) return true;

  const cached = nip50BehaviorCache.get(relayUrl);
  if (cached && Date.now() - cached.timestamp < RELAY_NIP50_BEHAVIOR_CACHE_DURATION) {
    return cached.supportsSearch;
  }

  const existing = nip50BehaviorInFlight.get(relayUrl);
  if (existing) return existing;

  const generation = searchRelayGeneration;
  const verification = (async () => {
    const bogusSearch = `ants-nip50-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const bogusProbe = await probeSearch(relayUrl, bogusSearch);

    let supportsSearch = false;
    if (bogusProbe.opened && !bogusProbe.error && bogusProbe.events === 0) {
      const sanityProbe = await probeSearch(relayUrl, NIP50_SANITY_SEARCH);
      supportsSearch = sanityProbe.opened
        && !sanityProbe.error
        && !sanityProbe.closed
        && sanityProbe.events > 0;
    }

    if (generation === searchRelayGeneration) {
      nip50BehaviorCache.set(relayUrl, { supportsSearch, timestamp: Date.now() });
    }
    return supportsSearch;
  })().finally(() => {
    if (nip50BehaviorInFlight.get(relayUrl) === verification) {
      nip50BehaviorInFlight.delete(relayUrl);
    }
  });

  nip50BehaviorInFlight.set(relayUrl, verification);
  return verification;
}

// Check whether a relay supports NIP-50
export async function checkNip50Support(relayUrl: string): Promise<{ supportsNip50: boolean; supportedNips: number[] }> {
  const relayInfo = await getRelayInfo(relayUrl);

  if (relayInfo.supportedNips) {
    const supportsNip50 = relayInfo.supportedNips.includes(50)
      && await verifiesSearchBehavior(relayUrl);
    return {
      supportsNip50,
      supportedNips: relayInfo.supportedNips
    };
  }

  return { supportsNip50: false, supportedNips: [] };
}

// Filter relays to only those supporting NIP-50
export async function filterNip50Relays(relayUrls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    relayUrls.map(async (url) => {
      const nip50Info = await checkNip50Support(url);
      return { url, nip50Info };
    })
  );

  const supportedRelays: string[] = [];
  const rejectedRelays: string[] = [];

  results.forEach((result, index) => {
    const url = relayUrls[index];
    if (result.status === 'fulfilled' && result.value.nip50Info.supportsNip50) {
      supportedRelays.push(url);
    } else {
      rejectedRelays.push(url);
    }
  });

  // If we have very few NIP-50 relays, fall back to unchecked candidates from
  // the curated search relay set, but only after verifying NIP-50 support
  if (supportedRelays.length < 3) {
    const fallbackCandidates = RELAYS.SEARCH.filter(
      (url) => !supportedRelays.includes(url) && !rejectedRelays.includes(url)
    );

    const fallbackResults = await Promise.allSettled(
      fallbackCandidates.map(async (url) => {
        const nip50Info = await checkNip50Support(url);
        return { url, supportsNip50: nip50Info.supportsNip50 };
      })
    );

    fallbackResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.supportsNip50) {
        supportedRelays.push(result.value.url);
      }
    });
  }

  return supportedRelays;
}

// Get NIP-50 capable relay set from a list of URLs
export async function getNip50RelaySet(relayUrls: string[]): Promise<NDKRelaySet> {
  const nip50Relays = await filterNip50Relays(relayUrls);
  return createRelaySet(nip50Relays);
}

// Resolving the search relay set involves NIP-51 list fetches and NIP-11
// checks, so memoize the resolved URLs per login/manual-relay state. The
// underlying caches handle staleness; this just keeps repeat searches from
// re-awaiting the whole pipeline.
const SEARCH_RELAY_URLS_TTL_MS = 60_000;
let cachedSearchRelayUrls: { key: string; urls: string[]; timestamp: number } | null = null;
let inFlightSearchRelayUrls: { key: string; generation: number; promise: Promise<string[]> } | null = null;

function searchRelayCacheKey(): string {
  const pubkey = getStoredPubkey() || 'anon';
  const manual = getUserRelayAdditions().slice().sort().join(',');
  return `${pubkey}|${manual}`;
}

async function gatherCandidateRelays(): Promise<string[]> {
  // Curated search relays plus the user's relays, manual additions, premium
  // relays, NIP-51 search relays, and NIP-66 discovery hints. NIP-66 data is
  // only a source of candidates; active NIP-50 filtering happens afterwards.
  const [configuredRelays, nip66Relays] = await Promise.all([
    extendWithUserAndPremium([...RELAYS.SEARCH], { includeSearchRelays: true }),
    discoverNip66SearchRelays()
  ]);
  return Array.from(new Set([...configuredRelays, ...nip66Relays]));
}

// On a cold NIP-11 cache, waiting for every relay check means the slowest
// (or dead) relay gates the first search. Resolve early once this many
// relays are confirmed; the full check keeps running and updates the cache.
const EARLY_RELAY_TARGET = 3;

function filterNip50RelaysEarly(relayUrls: string[], full: Promise<string[]>): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    let done = false;
    const confirmed: string[] = [];
    const finish = (urls: string[]) => {
      if (done) return;
      done = true;
      resolve(urls);
    };

    for (const url of relayUrls) {
      void checkNip50Support(url)
        .then((info) => {
          if (done || !info.supportsNip50) return;
          confirmed.push(url);
          if (confirmed.length >= EARLY_RELAY_TARGET) finish([...confirmed]);
        })
        .catch(() => {});
    }

    // Whatever the full pipeline produces (including its <3 relay fallback
    // probing) always wins if the early target was never reached.
    void full.then(finish).catch(() => finish(confirmed.length > 0 ? [...confirmed] : []));
  });
}

async function getSearchRelayUrls(): Promise<string[]> {
  const key = searchRelayCacheKey();

  if (cachedSearchRelayUrls && cachedSearchRelayUrls.key === key
    && (Date.now() - cachedSearchRelayUrls.timestamp) < SEARCH_RELAY_URLS_TTL_MS) {
    return cachedSearchRelayUrls.urls;
  }

  if (inFlightSearchRelayUrls && inFlightSearchRelayUrls.key === key) {
    return inFlightSearchRelayUrls.promise;
  }

  const generation = searchRelayGeneration;
  const early = (async () => {
    const candidates = await gatherCandidateRelays();

    // Both paths probe the same candidates, but getRelayInfo() dedupes
    // concurrent lookups per relay, so each relay is checked once.
    // Full resolution caches its result so later searches use the whole set.
    const full = filterNip50Relays(candidates)
      .then((urls) => {
        if (urls.length > 0 && generation === searchRelayGeneration) {
          cachedSearchRelayUrls = { key, urls, timestamp: Date.now() };
        }
        return urls;
      })
      .finally(() => {
        if (inFlightSearchRelayUrls?.key === key && inFlightSearchRelayUrls.generation === generation) {
          inFlightSearchRelayUrls = null;
        }
      });

    return filterNip50RelaysEarly(candidates, full);
  })().catch((error) => {
    if (inFlightSearchRelayUrls?.key === key && inFlightSearchRelayUrls.generation === generation) {
      inFlightSearchRelayUrls = null;
    }
    throw error;
  });

  inFlightSearchRelayUrls = { key, generation, promise: early };
  return early;
}

// Enhanced search relay set that filters for NIP-50 support
export async function getNip50SearchRelaySet(): Promise<NDKRelaySet> {
  const nip50Relays = await getSearchRelayUrls();
  return createRelaySet(nip50Relays);
}

// Resolve (and cache) the search relay set ahead of the first search so the
// NIP-11/NIP-51 round-trips happen while the user is still typing. Creating
// the relay set also opens the websockets, so the first search doesn't pay
// for the connection handshakes either.
export function prewarmSearchRelaySet(): void {
  void getSearchRelayUrls()
    .then((urls) => createRelaySet(urls))
    .catch(() => {});
}

export function clearSearchRelayUrlCache(): void {
  searchRelayGeneration += 1;
  cachedSearchRelayUrls = null;
  inFlightSearchRelayUrls = null;
  nip50BehaviorCache.clear();
  nip50BehaviorInFlight.clear();
}
