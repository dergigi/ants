import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '../ndk';
import { RELAYS } from './config';

type RelayList = { read: string[]; write: string[] };
const cache = new Map<string, { list: RelayList; expires: number }>();
let generation = 0;

export function clearOutboxCache(): void {
  generation += 1;
  cache.clear();
}

function secureRelayUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'wss:' || !url.hostname || url.username || url.password || url.hash) return;
    // Normalize an empty root path without changing case-sensitive paths or queries.
    return url.pathname === '/' && !url.search ? url.origin : url.toString();
  } catch { return; }
}

function advertisedRelays(event: NDKEvent): RelayList {
  const urls = (marker: string) => [...new Set(event.tags
    .filter(tag => tag[0] === 'r' && (!tag[2] || tag[2] === marker))
    .map(tag => secureRelayUrl(tag[1]))
    .filter((url): url is string => !!url))].slice(0, 4);
  return { read: urls('read'), write: urls('write') };
}

// Use the transport directly: relay-list discovery must never route recursively.
async function discover(keys: string[], fallback: string[], signal?: AbortSignal): Promise<void> {
  const missing = keys.filter(key => (cache.get(key)?.expires ?? 0) <= Date.now());
  if (!missing.length || signal?.aborted) return;
  const epoch = generation;
  await new Promise<void>(resolve => {
    const latest = new Map<string, NDKEvent>();
    const wanted = new Set(missing);
    let settled = false;
    let sub: ReturnType<typeof safeSubscribe> = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      if (sub) {
        sub.removeListener('event', onEvent);
        sub.removeListener('eose', finish);
        try { sub.stop(); } catch {}
      }
      if (!signal?.aborted && epoch === generation) {
        for (const key of missing) {
          const event = latest.get(key);
          cache.set(key, {
            list: event ? advertisedRelays(event) : { read: [], write: [] },
            expires: Date.now() + (event ? 600_000 : 60_000)
          });
        }
        while (cache.size > 256) cache.delete(cache.keys().next().value!);
      }
      resolve();
    };
    const onEvent = (event: NDKEvent) => {
      if (settled || event.kind !== 10002 || !wanted.has(event.pubkey)) return;
      const previous = latest.get(event.pubkey);
      if (!previous || (event.created_at ?? 0) > (previous.created_at ?? 0)
        || (event.created_at === previous.created_at && event.id < previous.id)) latest.set(event.pubkey, event);
    };
    const timer = setTimeout(finish, 4000);
    signal?.addEventListener('abort', finish, { once: true });
    try {
      sub = safeSubscribe([{ kinds: [10002], authors: missing, limit: missing.length * 2 }], {
        closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        relayUrls: [...new Set(['wss://purplepag.es', ...RELAYS.DEFAULT, ...fallback])].slice(0, 8)
      }, false);
      if (!sub) { finish(); return; }
      sub.on('event', onEvent);
      sub.on('eose', finish);
      sub.start();
    } catch { finish(); }
  });
}

/** Add NIP-65 routes to structured queries, retaining the caller's fallback relays. */
export async function getOutboxRelaySet(filter: NDKFilter, fallback: NDKRelaySet, signal?: AbortSignal): Promise<NDKRelaySet> {
  if (filter.search !== undefined || signal?.aborted) return fallback;
  const authors = filter.authors ?? [];
  const mentions = filter['#p'] ?? [];
  const keys = [...new Set([...authors, ...mentions])].filter(key => /^[0-9a-f]{64}$/.test(key)).slice(0, 32);
  if (!keys.length) return fallback;
  const urls = [...fallback.relays].map(relay => relay.url);
  await discover(keys, urls, signal);
  if (signal?.aborted) return fallback;
  const allowed = new Set(keys);
  const preferred = [
    ...authors.filter(key => allowed.has(key)).flatMap(key => cache.get(key)?.list.write ?? []),
    ...mentions.filter(key => allowed.has(key)).flatMap(key => cache.get(key)?.list.read ?? [])
  ];
  const additions = [...new Set(preferred)].filter(url => !urls.includes(url)).slice(0, 16);
  return additions.length ? NDKRelaySet.fromRelayUrls([...urls, ...additions], ndk) : fallback;
}
