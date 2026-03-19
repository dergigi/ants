/**
 * NIP-45 COUNT — Non-blocking relay event counts
 *
 * Opens independent WebSocket connections (not through NDK, which lacks COUNT support)
 * to ask relays "how many events match?" in a single round-trip.
 */

import { NDKFilter } from '@nostr-dev-kit/ndk';
import { getRelayInfo } from '../relays';
import { getRelayMonitorEntry } from '../nip66';
import { NIP45_COUNT_TIMEOUT, NIP45_BENCHMARK_LOG } from '../constants';

export interface CountResult {
  relayUrl: string;
  count: number;
  approximate: boolean;
  latencyMs: number;
}

export interface AggregateCount {
  total: number;
  perRelay: CountResult[];
  totalMs: number;
}

/**
 * Check if a relay supports NIP-45 via cached NIP-66 data or relay info cache.
 */
async function supportsNip45(relayUrl: string): Promise<boolean> {
  // Fast path: NIP-66 monitor data (no network request)
  const monitorEntry = getRelayMonitorEntry(relayUrl);
  if (monitorEntry?.isAlive && monitorEntry.supportedNips.includes(45)) {
    return true;
  }

  // Fallback: cached relay info (may trigger HTTP NIP-11 probe)
  const info = await getRelayInfo(relayUrl);
  return info.supportedNips?.includes(45) ?? false;
}

/**
 * Send a COUNT request to a single relay via raw WebSocket.
 */
function countFromRelay(
  relayUrl: string,
  filter: NDKFilter,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<CountResult | null> {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) {
      resolve(null);
      return;
    }

    const start = performance.now();
    let ws: WebSocket;
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
    };

    const onAbort = () => {
      cleanup();
      resolve(null);
    };

    abortSignal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      cleanup();
      abortSignal?.removeEventListener('abort', onAbort);
      resolve(null);
    }, timeoutMs);

    try {
      ws = new WebSocket(relayUrl);
    } catch {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      resolve(null);
      return;
    }

    const subId = `count-${Math.random().toString(36).slice(2, 8)}`;

    ws.onopen = () => {
      if (settled) return;
      try {
        ws.send(JSON.stringify(['COUNT', subId, filter]));
      } catch {
        cleanup();
        clearTimeout(timer);
        abortSignal?.removeEventListener('abort', onAbort);
        resolve(null);
      }
    };

    ws.onmessage = (event) => {
      if (settled) return;
      try {
        const data = JSON.parse(event.data);
        // NIP-45 response: ["COUNT", <subId>, {"count": <n>, "approximate"?: true}]
        if (Array.isArray(data) && data[0] === 'COUNT' && data[1] === subId && data[2]) {
          const latencyMs = performance.now() - start;
          const count = typeof data[2].count === 'number' ? data[2].count : 0;
          const approximate = data[2].approximate === true;

          cleanup();
          clearTimeout(timer);
          abortSignal?.removeEventListener('abort', onAbort);

          resolve({ relayUrl, count, approximate, latencyMs });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      cleanup();
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      resolve(null);
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        abortSignal?.removeEventListener('abort', onAbort);
        resolve(null);
      }
    };
  });
}

/**
 * Fire NIP-45 COUNT requests to qualifying relays in parallel.
 *
 * Pre-filters relays for NIP-45 support. If none qualify, resolves
 * immediately with total: 0. Takes the max count across relays
 * (since relay data overlaps; summing would overcount).
 */
export async function fireNip45Count(
  filter: NDKFilter,
  relayUrls: string[],
  options: { timeoutMs?: number; abortSignal?: AbortSignal } = {},
): Promise<AggregateCount> {
  const timeoutMs = options.timeoutMs ?? NIP45_COUNT_TIMEOUT;
  const start = performance.now();

  // Pre-filter for NIP-45 support
  const checks = await Promise.allSettled(
    relayUrls.map(async (url) => ({ url, supported: await supportsNip45(url) })),
  );

  const qualifyingRelays = checks
    .filter((r): r is PromiseFulfilledResult<{ url: string; supported: boolean }> =>
      r.status === 'fulfilled' && r.value.supported,
    )
    .map((r) => r.value.url);

  if (qualifyingRelays.length === 0) {
    return { total: 0, perRelay: [], totalMs: performance.now() - start };
  }

  // Send COUNT to all qualifying relays in parallel
  const results = await Promise.allSettled(
    qualifyingRelays.map((url) =>
      countFromRelay(url, filter, timeoutMs, options.abortSignal),
    ),
  );

  const perRelay: CountResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      perRelay.push(result.value);
    }
  }

  // Take max count across relays (overlapping data; sum would overcount)
  const total = perRelay.reduce((max, r) => Math.max(max, r.count), 0);
  const totalMs = performance.now() - start;

  // Benchmark logging
  if (NIP45_BENCHMARK_LOG && perRelay.length > 0) {
    for (const r of perRelay) {
      console.log(
        `[NIP-45] ${r.relayUrl}: ${r.count.toLocaleString()}${r.approximate ? ' (approximate)' : ''} in ${Math.round(r.latencyMs)}ms`,
      );
    }
  }

  return { total, perRelay, totalMs };
}
