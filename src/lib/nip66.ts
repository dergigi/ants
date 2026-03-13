// NIP-66 Relay Monitor Integration
// Fetches kind 30166 events from monitor relays to determine relay liveness,
// RTT, and NIP support. Used to pre-filter dead relays before probing.

import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from './ndk';
import { normalizeRelayUrl } from './urlUtils';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage, clearStorageKey } from './storageCache';
import {
  NIP66_CACHE_DURATION,
  NIP66_FETCH_TIMEOUT,
  NIP66_REFRESH_INTERVAL,
  NIP66_SAFETY_THRESHOLD,
  NIP66_DEAD_ENTRY_MAX_AGE,
} from './constants';

export interface Nip66Entry {
  relayUrl: string;
  isAlive: boolean;
  rttOpen?: number;
  rttRead?: number;
  rttWrite?: number;
  supportedNips: number[];
  network?: string;
  monitorPubkey: string;
  lastSeen: number;    // event created_at (seconds)
  cachedAt: number;    // Date.now() (milliseconds)
}

const KNOWN_MONITOR_RELAYS = [
  'wss://relaypag.es',
  'wss://relay.nostr.watch',
  'wss://monitorlizard.nostr1.com',
];

const CACHE_STORAGE_KEY = 'ants_nip66_cache';

// In-memory cache: normalized relay URL → Nip66Entry
const nip66Cache = new Map<string, Nip66Entry>();

// Track when the last successful fetch completed (this session only)
let lastFetchTimestamp = 0;

// Coalesce concurrent fetchMonitorData calls
let inflightFetch: Promise<void> | null = null;

// Background refresh interval handle
let refreshInterval: ReturnType<typeof setInterval> | null = null;

// Load cache from localStorage on module init (browser only)
function loadCacheFromStorage(): void {
  try {
    const loaded = loadMapFromStorage<Nip66Entry>(CACHE_STORAGE_KEY);
    for (const [url, entry] of loaded.entries()) {
      nip66Cache.set(url, entry);
    }
  } catch {
    // ignore
  }
}

function saveCacheToStorage(): void {
  try {
    saveMapToStorage(CACHE_STORAGE_KEY, nip66Cache);
  } catch {
    // ignore
  }
}

if (hasLocalStorage()) {
  loadCacheFromStorage();
}

/**
 * Parse a single kind 30166 monitor event into a Nip66Entry.
 */
export function parseMonitorEvent(event: NDKEvent): Nip66Entry | null {
  // The `d` tag contains the relay URL being monitored
  const dTag = event.tags.find(t => t[0] === 'd');
  if (!dTag || !dTag[1]) return null;

  const relayUrl = normalizeRelayUrl(dTag[1]);
  if (!relayUrl) return null;

  let rttOpen: number | undefined;
  let rttRead: number | undefined;
  let rttWrite: number | undefined;
  const supportedNips: number[] = [];
  let network: string | undefined;

  for (const tag of event.tags) {
    if (tag[0] === 'rtt-open' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) rttOpen = val;
    } else if (tag[0] === 'rtt-read' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) rttRead = val;
    } else if (tag[0] === 'rtt-write' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) rttWrite = val;
    } else if (tag[0] === 'N' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) supportedNips.push(val);
    } else if (tag[0] === 'n' && tag[1]) {
      network = tag[1];
    }
  }

  return {
    relayUrl,
    isAlive: rttOpen !== undefined,
    rttOpen,
    rttRead,
    rttWrite,
    supportedNips,
    network,
    monitorPubkey: event.pubkey,
    lastSeen: event.created_at ?? Math.floor(Date.now() / 1000),
    cachedAt: Date.now(),
  };
}

/**
 * Fetch kind 30166 events from monitor relays + connected relays.
 * Merges results into the in-memory cache (keeps most recent per relay URL).
 */
export async function fetchMonitorData(): Promise<void> {
  // Debounce: skip if fetched recently
  if (lastFetchTimestamp > 0 && Date.now() - lastFetchTimestamp < NIP66_CACHE_DURATION) {
    return;
  }

  // Coalesce concurrent calls
  if (inflightFetch) return inflightFetch;

  inflightFetch = (async () => {
    try {
      // Build relay set: known monitors + user's connected relays
      const relayUrls = new Set<string>(KNOWN_MONITOR_RELAYS);
      if (ndk.pool?.relays) {
        for (const [url, relay] of ndk.pool.relays.entries()) {
          if (relay.status === 1) { // connected
            relayUrls.add(url);
          }
        }
      }

      const relaySet = NDKRelaySet.fromRelayUrls(Array.from(relayUrls), ndk);

      const events = await new Promise<NDKEvent[]>((resolve) => {
        const collected: NDKEvent[] = [];
        const sub = safeSubscribe(
          [{ kinds: [30166 as number], limit: 500 }],
          { closeOnEose: true, relaySet }
        );

        if (!sub) {
          resolve([]);
          return;
        }

        const timer = setTimeout(() => {
          try { sub.stop(); } catch {}
          resolve(collected);
        }, NIP66_FETCH_TIMEOUT);

        sub.on('event', (event: NDKEvent) => {
          collected.push(event);
        });

        sub.on('eose', () => {
          clearTimeout(timer);
          try { sub.stop(); } catch {}
          resolve(collected);
        });

        sub.start();
      });

      // Merge into cache: keep most recent entry per relay URL
      for (const event of events) {
        const entry = parseMonitorEvent(event);
        if (!entry) continue;

        const existing = nip66Cache.get(entry.relayUrl);
        if (!existing || entry.lastSeen > existing.lastSeen) {
          nip66Cache.set(entry.relayUrl, entry);
        }
      }

      lastFetchTimestamp = Date.now();
      saveCacheToStorage();
    } catch (error) {
      console.warn('[NIP-66] Failed to fetch monitor data:', error);
    }
  })();

  try {
    await inflightFetch;
  } finally {
    inflightFetch = null;
  }
}

/**
 * Public entry point. Ensures NIP-66 data is available:
 * - If in-memory cache has data within NIP66_CACHE_DURATION, returns immediately
 * - If cache is empty, loads from localStorage
 * - If no fetch has happened this session or data is stale, triggers fetchMonitorData
 */
export async function ensureNip66Data(): Promise<void> {
  // If we have recent data in memory, nothing to do
  if (nip66Cache.size > 0 && lastFetchTimestamp > 0 && Date.now() - lastFetchTimestamp < NIP66_CACHE_DURATION) {
    return;
  }

  // If cache is empty, try loading from localStorage
  if (nip66Cache.size === 0 && hasLocalStorage()) {
    loadCacheFromStorage();
  }

  // Trigger a fetch if we haven't fetched this session or data is stale
  if (lastFetchTimestamp === 0 || Date.now() - lastFetchTimestamp >= NIP66_CACHE_DURATION) {
    await fetchMonitorData();
  }
}

/**
 * Classify a relay's liveness based on cached NIP-66 data.
 *
 * Asymmetric policy:
 * - Including a dead relay is cheap (just a timeout, same as current behavior)
 * - Excluding a live relay is costly (missed search results)
 * So we only exclude when confident the relay is dead.
 */
export function classifyRelay(relayUrl: string): 'alive' | 'dead' | 'unknown' {
  const normalized = normalizeRelayUrl(relayUrl);

  // .onion URLs can't be probed by monitors
  if (normalized.includes('.onion')) return 'alive';

  const entry = nip66Cache.get(normalized);
  if (!entry) return 'unknown';

  // Alive entries are always trusted (false positive = just a timeout)
  if (entry.isAlive) return 'alive';

  // Dead entry: only trust if recent (< 24 hours)
  const age = Date.now() - entry.cachedAt;
  if (age < NIP66_DEAD_ENTRY_MAX_AGE) return 'dead';

  // Stale dead entry degrades to unknown (include, don't risk excluding)
  return 'unknown';
}

/**
 * Filter out relays classified as 'dead'. Keeps 'alive' and 'unknown'.
 * Returns input unchanged if cache is empty or safety valve triggers.
 */
export function filterDeadRelays(relayUrls: string[]): string[] {
  if (nip66Cache.size === 0) return relayUrls;

  const live = relayUrls.filter(url => classifyRelay(url) !== 'dead');

  // Safety valve: if >80% would be removed, skip filtering entirely
  if (live.length < relayUrls.length * (1 - NIP66_SAFETY_THRESHOLD)) {
    return relayUrls;
  }

  return live;
}

/**
 * Return all cached relays that are alive and support NIP-50.
 * Used to discover new NIP-50 relays beyond the hardcoded list.
 */
export function getMonitoredNip50Relays(): string[] {
  const result: string[] = [];
  for (const entry of nip66Cache.values()) {
    if (entry.isAlive && entry.supportedNips.includes(50)) {
      result.push(entry.relayUrl);
    }
  }
  return result;
}

/**
 * Look up the monitor entry for a specific relay URL (for UI display).
 */
export function getRelayMonitorEntry(relayUrl: string): Nip66Entry | undefined {
  const normalized = normalizeRelayUrl(relayUrl);
  return nip66Cache.get(normalized);
}

/**
 * Start background NIP-66 refresh (every NIP66_REFRESH_INTERVAL).
 */
export function startNip66Refresh(): void {
  if (refreshInterval) return;
  refreshInterval = setInterval(() => {
    fetchMonitorData().catch(() => {});
  }, NIP66_REFRESH_INTERVAL);
}

/**
 * Stop background NIP-66 refresh.
 */
export function stopNip66Refresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

/**
 * Clear all NIP-66 data (in-memory + localStorage).
 */
export function clearNip66Cache(): void {
  nip66Cache.clear();
  lastFetchTimestamp = 0;
  try {
    clearStorageKey(CACHE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
