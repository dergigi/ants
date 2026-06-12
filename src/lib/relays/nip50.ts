import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../nip07';
import { getUserRelayAdditions } from '../storage';
import { RELAYS, createRelaySet } from './config';
import { getRelayInfo } from './infoCache';
import { discoverUserRelays, extendWithUserAndPremium } from './userDiscovery';

// Check whether a relay supports NIP-50
export async function checkNip50Support(relayUrl: string): Promise<{ supportsNip50: boolean; supportedNips: number[] }> {
  const relayInfo = await getRelayInfo(relayUrl);

  if (relayInfo.supportedNips) {
    const supportsNip50 = relayInfo.supportedNips.includes(50);
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
let inFlightSearchRelayUrls: { key: string; promise: Promise<string[]> } | null = null;

function searchRelayCacheKey(): string {
  const pubkey = getStoredPubkey() || 'anon';
  const manual = getUserRelayAdditions().slice().sort().join(',');
  return `${pubkey}|${manual}`;
}

async function gatherCandidateRelays(): Promise<string[]> {
  const pubkey = getStoredPubkey();

  // Start with hardcoded search relays
  const allSearchRelays: string[] = [...RELAYS.SEARCH];

  // Add user's search relays if logged in
  if (pubkey) {
    try {
      const { searchRelays } = await discoverUserRelays(pubkey);
      allSearchRelays.push(...searchRelays);
    } catch (error) {
      console.warn('[NIP-51] Failed to discover user search relays:', error);
    }
  }

  // All relays (including user relays); NIP-50 filtering happens afterwards
  return extendWithUserAndPremium(allSearchRelays);
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

  const early = (async () => {
    const candidates = await gatherCandidateRelays();

    // Full resolution caches its result so later searches use the whole set
    const full = filterNip50Relays(candidates)
      .then((urls) => {
        if (urls.length > 0) cachedSearchRelayUrls = { key, urls, timestamp: Date.now() };
        return urls;
      })
      .finally(() => {
        if (inFlightSearchRelayUrls?.key === key) inFlightSearchRelayUrls = null;
      });

    return filterNip50RelaysEarly(candidates, full);
  })().catch((error) => {
    if (inFlightSearchRelayUrls?.key === key) inFlightSearchRelayUrls = null;
    throw error;
  });

  inFlightSearchRelayUrls = { key, promise: early };
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
  cachedSearchRelayUrls = null;
  inFlightSearchRelayUrls = null;
}
