/**
 * NIP-45 COUNT — Non-blocking relay event counts
 *
 * Opens independent WebSocket connections (not through NDK, which lacks COUNT support)
 * to ask relays "how many events match?" in a single round-trip.
 */

import { NDKFilter } from '@nostr-dev-kit/ndk';
import { relayInfoCache } from '../relays';
import { getRelayMonitorEntry } from '../nip66';
import { NIP45_COUNT_TIMEOUT, NIP45_BENCHMARK_LOG, RELAY_INFO_CACHE_DURATION } from '../constants';

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

/** Max relays to send COUNT to (avoid opening dozens of WebSocket connections) */
const MAX_COUNT_RELAYS = 5;

/**
 * Check if a relay supports NIP-45 using ONLY cached data (instant, no network).
 * Returns false if no cached info is available — never blocks on HTTP probes.
 */
function supportsNip45Cached(relayUrl: string): boolean {
  // Fast path: NIP-66 monitor data
  const monitorEntry = getRelayMonitorEntry(relayUrl);
  if (monitorEntry?.isAlive && monitorEntry.supportedNips.includes(45)) {
    return true;
  }

  // Check relay info cache (already populated by getNip50SearchRelaySet)
  const cached = relayInfoCache.get(relayUrl);
  if (cached && (Date.now() - cached.timestamp) < RELAY_INFO_CACHE_DURATION) {
    return cached.supportedNips?.includes(45) ?? false;
  }

  return false;
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
 * Fire NIP-45 COUNT requests to qualifying relays.
 *
 * Resolves as soon as the FIRST relay responds with count > 0 (race pattern).
 * Falls back to allSettled after timeout. Caps relay count to avoid
 * opening dozens of WebSocket connections.
 */
export async function fireNip45Count(
  filter: NDKFilter,
  relayUrls: string[],
  options: { timeoutMs?: number; abortSignal?: AbortSignal } = {},
): Promise<AggregateCount> {
  const timeoutMs = options.timeoutMs ?? NIP45_COUNT_TIMEOUT;
  const start = performance.now();

  // Normalize and deduplicate URLs (strip trailing slashes to match cache keys)
  const normalized = Array.from(new Set(relayUrls.map(u => u.replace(/\/+$/, ''))));

  // Pre-filter for NIP-45 support (cache-only, instant — no HTTP probes)
  // Prioritize relays that are also in relayInfoCache (already HTTP-probed, more reliable)
  const qualifying = normalized.filter(supportsNip45Cached);
  const cachedFirst = qualifying.sort((a, b) => {
    const aCached = relayInfoCache.has(a) ? 0 : 1;
    const bCached = relayInfoCache.has(b) ? 0 : 1;
    return aCached - bCached;
  });
  const targets = cachedFirst.slice(0, MAX_COUNT_RELAYS);

  if (NIP45_BENCHMARK_LOG) {
    console.log(`[NIP-45] ${new Date().toISOString()} firing COUNT to ${targets.length} relays (${qualifying.length} qualified of ${normalized.length}): ${targets.join(', ')}`);
  }

  if (targets.length === 0) {
    return { total: 0, perRelay: [], totalMs: performance.now() - start };
  }

  // Race: resolve as soon as first relay returns count > 0
  const perRelay: CountResult[] = [];
  const promises = targets.map((url) => countFromRelay(url, filter, timeoutMs, options.abortSignal));

  // Use Promise.any-like pattern: resolve on first successful count
  const result = await new Promise<AggregateCount>((resolve) => {
    let pending = promises.length;
    let resolved = false;

    promises.forEach((p) => {
      p.then((r) => {
        if (r) perRelay.push(r);
        // Resolve immediately on first count > 0
        if (r && r.count > 0 && !resolved) {
          resolved = true;
          const total = r.count;
          const totalMs = performance.now() - start;
          if (NIP45_BENCHMARK_LOG) {
            console.log(`[NIP-45] ${new Date().toISOString()} ${r.relayUrl}: ${r.count.toLocaleString()}${r.approximate ? ' (approximate)' : ''} in ${Math.round(r.latencyMs)}ms`);
          }
          resolve({ total, perRelay: [r], totalMs });
        }
        pending--;
        if (pending === 0 && !resolved) {
          // All settled, none had count > 0
          const total = perRelay.reduce((max, cr) => Math.max(max, cr.count), 0);
          resolve({ total, perRelay, totalMs: performance.now() - start });
        }
      });
    });
  });

  return result;
}
