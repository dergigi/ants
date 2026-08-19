import { NDKEvent, NDKFilter, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { safeSubscribe } from '../ndk';
import { RELAY_NIP66_DISCOVERY_CACHE_DURATION } from '../constants';
import { RELAYS, normalizeRelayUrl } from './config';

type DiscoveryCache = {
  urls: string[];
  timestamp: number;
};

const DISCOVERY_LIMIT_PER_RELAY = 25;
const MAX_DISCOVERED_SEARCH_RELAYS = 12;
const DISCOVERY_TIMEOUT_MS = 3000;
let discoveryCache: DiscoveryCache | null = null;
let inFlightDiscovery: Promise<string[]> | null = null;
let discoveryGeneration = 0;

function tagValue(event: NDKEvent, tagName: string): string | undefined {
  return event.tags.find((tag) => tag[0] === tagName && tag[1])?.[1];
}

function hasNip50Tag(event: NDKEvent): boolean {
  return event.tags.some((tag) => tag[0] === 'N' && tag[1] === '50');
}

function isTrustedMonitor(event: NDKEvent): boolean {
  return (RELAYS.NIP66_MONITOR_AUTHORS as readonly string[]).includes(event.pubkey);
}

function hasBlockingRequirement(event: NDKEvent): boolean {
  return event.tags.some((tag) => {
    if (tag[0] !== 'R' || !tag[1]) return false;
    return tag[1] === 'auth' || tag[1] === 'payment' || tag[1] === 'pow';
  });
}

function relayUrlFromDiscovery(event: NDKEvent): string | null {
  const rawUrl = tagValue(event, 'd') || tagValue(event, 'r');
  if (!rawUrl) return null;
  const normalized = normalizeRelayUrl(rawUrl);
  return normalized.startsWith('wss://') ? normalized : null;
}

function fetchNip66RelaysFrom(monitorRelay: string): Promise<string[]> {
  return new Promise((resolve) => {
    const urls = new Set<string>();
    const filter = {
      kinds: [30166],
      authors: [...RELAYS.NIP66_MONITOR_AUTHORS],
      '#N': ['50'],
      limit: DISCOVERY_LIMIT_PER_RELAY
    } as unknown as NDKFilter;
    const sub = safeSubscribe([filter], {
      closeOnEose: true,
      cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
      relayUrls: [monitorRelay]
    });

    if (!sub) {
      resolve([]);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve(Array.from(urls));
    };

    const timer = setTimeout(finish, DISCOVERY_TIMEOUT_MS);

    sub.on('event', (event: NDKEvent) => {
      if (!isTrustedMonitor(event) || !hasNip50Tag(event) || hasBlockingRequirement(event)) return;
      const relayUrl = relayUrlFromDiscovery(event);
      if (relayUrl) urls.add(relayUrl);
    });

    sub.on('eose', finish);
    sub.start();
  });
}

export async function discoverNip66SearchRelays(): Promise<string[]> {
  if (discoveryCache && Date.now() - discoveryCache.timestamp < RELAY_NIP66_DISCOVERY_CACHE_DURATION) {
    return discoveryCache.urls;
  }

  if (inFlightDiscovery) return inFlightDiscovery;

  const generation = discoveryGeneration;
  inFlightDiscovery = Promise.all(RELAYS.NIP66_MONITORS.map(fetchNip66RelaysFrom))
    .then((relayLists) => {
      const urls = Array.from(new Set(relayLists.flat())).slice(0, MAX_DISCOVERED_SEARCH_RELAYS);
      if (generation === discoveryGeneration) {
        discoveryCache = { urls, timestamp: Date.now() };
      }
      return urls;
    })
    .catch(() => [])
    .finally(() => {
      if (generation === discoveryGeneration) {
        inFlightDiscovery = null;
      }
    });

  return inFlightDiscovery;
}

export function clearNip66DiscoveryCache(): void {
  discoveryGeneration += 1;
  discoveryCache = null;
  inFlightDiscovery = null;
}
