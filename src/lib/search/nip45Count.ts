/**
 * NIP-45 COUNT — Non-blocking relay event counts
 *
 * Opens independent WebSocket connections (not through NDK, which lacks COUNT support)
 * to ask relays "how many events match?" in a single round-trip.
 */

import { NDKFilter } from '@nostr-dev-kit/ndk';
import { relayInfoCache } from '../relays';
import { normalizeRelayUrl } from '../urlUtils';
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
    let ws: WebSocket | undefined;
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch {}
    };

    const onAbort = () => {
      cleanup();
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
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

    // Re-check abort after WebSocket creation to close the race window
    // between addEventListener('abort') and new WebSocket()
    if (abortSignal?.aborted) {
      cleanup();
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      resolve(null);
      return;
    }

    const subId = `count-${Math.random().toString(36).slice(2, 8)}`;

    ws.onopen = () => {
      if (settled) return;
      try {
        ws!.send(JSON.stringify(['COUNT', subId, filter]));
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

/** After first positive COUNT, wait this long for higher counts from slower relays */
const COUNT_GRACE_MS = 500;

/**
 * Fire NIP-45 COUNT requests to qualifying relays.
 *
 * On first positive count, starts a grace period to collect higher counts
 * from slower relays, then resolves with the max. Caps relay count to avoid
 * opening dozens of WebSocket connections.
 *
 * Aborts remaining WebSocket connections once the aggregate resolves so
 * resources aren't held open unnecessarily.
 */
export async function fireNip45Count(
  filter: NDKFilter,
  relayUrls: string[],
  options: { timeoutMs?: number; abortSignal?: AbortSignal } = {},
): Promise<AggregateCount> {
  const timeoutMs = options.timeoutMs ?? NIP45_COUNT_TIMEOUT;
  const start = performance.now();

  // Normalize URLs to match cache keys (consistent with urlUtils used elsewhere)
  const normalized = relayUrls.map(normalizeRelayUrl).filter(Boolean);

  // Pre-filter for NIP-45 support (cache-only, instant — no HTTP probes)
  // No cap: input is already bounded by the search relay set (typically 7 relays)
  const targets = normalized.filter(supportsNip45Cached);

  if (NIP45_BENCHMARK_LOG) {
    console.log(`[NIP-45] ${new Date().toISOString()} firing COUNT to ${targets.length} relays (of ${normalized.length}): ${targets.join(', ')}`);
  }

  if (targets.length === 0) {
    return { total: 0, perRelay: [], totalMs: performance.now() - start };
  }

  // Local controller to abort remaining WebSocket connections once we finalize.
  // Chains from the caller's signal so external abort also cancels COUNT.
  const localController = new AbortController();
  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      localController.abort();
    } else {
      options.abortSignal.addEventListener('abort', () => localController.abort(), { once: true });
    }
  }

  const perRelay: CountResult[] = [];
  const promises = targets.map((url) => countFromRelay(url, filter, timeoutMs, localController.signal));

  // Race with grace period: on first positive count, wait up to COUNT_GRACE_MS
  // for higher counts from slower relays, then resolve with the max.
  const result = await new Promise<AggregateCount>((resolve) => {
    let pending = promises.length;
    let resolved = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const finalize = () => {
      if (resolved) return;
      resolved = true;
      if (graceTimer) clearTimeout(graceTimer);
      // Abort remaining connections — no point keeping WebSockets open
      localController.abort();
      const total = perRelay.reduce((max, cr) => Math.max(max, cr.count), 0);
      const totalMs = performance.now() - start;
      if (NIP45_BENCHMARK_LOG) {
        for (const r of perRelay) {
          console.log(`[NIP-45] ${new Date().toISOString()} ${r.relayUrl}: ${r.count.toLocaleString()}${r.approximate ? ' (approximate)' : ''} in ${Math.round(r.latencyMs)}ms`);
        }
      }
      resolve({ total, perRelay, totalMs });
    };

    promises.forEach((p) => {
      p.then((r) => {
        if (r) perRelay.push(r);
        // Start grace timer on first positive count
        if (r && r.count > 0 && !graceTimer && !resolved) {
          graceTimer = setTimeout(finalize, COUNT_GRACE_MS);
        }
        pending--;
        if (pending === 0) finalize();
      }).catch(() => {
        pending--;
        if (pending === 0) finalize();
      });
    });
  });

  return result;
}
