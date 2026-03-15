import NDK, { NDKFilter, NDKRelaySet, NDKSubscription } from '@nostr-dev-kit/ndk';
import { RELAY_PING_TIMEOUT } from './constants';

type SafeSubscribeFn = (filters: NDKFilter[], options?: Record<string, unknown>) => NDKSubscription | null;

export interface RelayPingDeps {
  ndk: NDK;
  safeSubscribe: SafeSubscribeFn;
}

/**
 * Measure ping time for a specific relay by scoping the subscription to that relay only.
 */
export async function measureRelayPing(
  relayUrl: string,
  deps: RelayPingDeps
): Promise<number> {
  try {
    const relay = deps.ndk.pool?.relays?.get(relayUrl);
    if (!relay || relay.status !== 1) {
      return -1; // Not connected
    }

    const relaySet = NDKRelaySet.fromRelayUrls([relayUrl], deps.ndk);
    const startTime = performance.now();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(-1); // Timeout
      }, RELAY_PING_TIMEOUT);

      const sub = deps.safeSubscribe([{ kinds: [1], limit: 1 }], {
        closeOnEose: true,
        cacheUsage: 'ONLY_RELAY' as const,
        relaySet, // Scoped to single relay
      });

      if (sub) {
        sub.on('eose', () => {
          clearTimeout(timeout);
          const pingTime = Math.round(performance.now() - startTime);
          resolve(pingTime);
        });

        sub.on('closed', () => {
          clearTimeout(timeout);
          resolve(-1);
        });

        sub.start();
      } else {
        clearTimeout(timeout);
        resolve(-1);
      }
    });
  } catch {
    return -1;
  }
}

/**
 * Measure ping times for all connected relays.
 */
export async function measureAllRelayPings(
  deps: RelayPingDeps
): Promise<Map<string, number>> {
  const connectedRelays = Array.from(deps.ndk.pool?.relays?.keys() || [])
    .filter(url => deps.ndk.pool?.relays?.get(url)?.status === 1);

  const pingPromises = connectedRelays.map(async (url) => {
    const ping = await measureRelayPing(url, deps);
    return { url, ping };
  });

  const results = await Promise.all(pingPromises);
  const pingMap = new Map<string, number>();

  results.forEach(({ url, ping }) => {
    if (ping > 0) {
      pingMap.set(url, ping);
    }
  });

  return pingMap;
}
