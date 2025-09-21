import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '../storageCache';
import { normalizeNip05String } from '../nip05';
import { nip05 as nostrNip05 } from 'nostr-tools';

// Simple in-memory + persisted cache for NIP-05 verification results
const NIP05_CACHE_STORAGE_KEY = 'ants_nip05_cache_v1';
type Nip05CacheValue = { ok: boolean; timestamp: number };
const NIP05_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const nip05VerificationCache = new Map<string, boolean>();
const nip05PersistentCache: Map<string, Nip05CacheValue> = loadMapFromStorage<Nip05CacheValue>(NIP05_CACHE_STORAGE_KEY);

function nip05CacheKey(pubkeyHex: string, nip05: string): string {
  const normalized = normalizeNip05String(nip05);
  return `${normalized}|${pubkeyHex}`;
}

function getCachedNip05Result(pubkeyHex: string, nip05?: string): boolean | null {
  if (!nip05) return null;
  try {
    const key = nip05CacheKey(pubkeyHex, nip05);
    if (nip05VerificationCache.has(key)) return nip05VerificationCache.get(key) as boolean;
    const persisted = nip05PersistentCache.get(key);
    if (persisted && (Date.now() - persisted.timestamp) <= NIP05_TTL_MS) {
      nip05VerificationCache.set(key, persisted.ok);
      return persisted.ok;
    }
    return null;
  } catch {
    return null;
  }
}

async function verifyNip05ViaApi(pubkeyHex: string, normalizedNip05: string): Promise<boolean> {
  try {
    const url = `/api/nip05/verify?pubkey=${encodeURIComponent(pubkeyHex)}&nip05=${encodeURIComponent(normalizedNip05)}`;
    const resp = await fetch(url);
    if (!resp.ok) return false;
    const data = await resp.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

// Track in-flight verification promises to dedupe concurrent calls
const nip05InFlight = new Map<string, Promise<boolean>>();

async function verifyNip05(pubkeyHex: string, nip05?: string): Promise<boolean> {
  if (!nip05) return false;
  const normalized = normalizeNip05String(nip05);
  if (!normalized) return false;
  const cacheKey = nip05CacheKey(pubkeyHex, nip05);

  // 1) Memory cache
  if (nip05VerificationCache.has(cacheKey)) return nip05VerificationCache.get(cacheKey) as boolean;

  // 2) Persistent cache
  const persisted = nip05PersistentCache.get(cacheKey);
  if (persisted && (Date.now() - persisted.timestamp) <= NIP05_TTL_MS) {
    nip05VerificationCache.set(cacheKey, persisted.ok);
    return persisted.ok;
  }

  // 3) Dedupe concurrent verifications
  if (nip05InFlight.has(cacheKey)) return nip05InFlight.get(cacheKey) as Promise<boolean>;

  const promise = (async () => {
    try {
      // Try server-side endpoint to avoid CORS from browser
      const okApi = await verifyNip05ViaApi(pubkeyHex, normalized);
      if (okApi !== false) {
        nip05VerificationCache.set(cacheKey, okApi);
        nip05PersistentCache.set(cacheKey, { ok: okApi, timestamp: Date.now() });
        if (hasLocalStorage()) saveMapToStorage(NIP05_CACHE_STORAGE_KEY, nip05PersistentCache);
        return okApi;
      }
    } catch {}
    try {
      // Fallback to direct nostr-tools check
      const ok = await nostrNip05.isValid(pubkeyHex, normalized as `${string}@${string}`);
      nip05VerificationCache.set(cacheKey, ok);
      nip05PersistentCache.set(cacheKey, { ok, timestamp: Date.now() });
      if (hasLocalStorage()) saveMapToStorage(NIP05_CACHE_STORAGE_KEY, nip05PersistentCache);
      return ok;
    } catch {}
    // Record negative with timestamp to avoid thrash
    nip05VerificationCache.set(cacheKey, false);
    nip05PersistentCache.set(cacheKey, { ok: false, timestamp: Date.now() });
    if (hasLocalStorage()) saveMapToStorage(NIP05_CACHE_STORAGE_KEY, nip05PersistentCache);
    return false;
  })();

  nip05InFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    nip05InFlight.delete(cacheKey);
  }
}

// Invalidate one cached NIP-05 verification entry
export function invalidateNip05Cache(pubkeyHex: string, nip05: string): void {
  try {
    const key = nip05CacheKey(pubkeyHex, nip05);
    nip05VerificationCache.delete(key);
    // Also delete raw key if it was stored prior to normalization change
    nip05VerificationCache.delete(`${nip05}|${pubkeyHex}`);
    nip05PersistentCache.delete(key);
    if (hasLocalStorage()) saveMapToStorage(NIP05_CACHE_STORAGE_KEY, nip05PersistentCache);
  } catch {}
}

// Check NIP-05 using cache; does not invalidate
export async function checkNip05(pubkeyHex: string, nip05: string): Promise<boolean> {
  return verifyNip05(pubkeyHex, nip05);
}

// Export the cached result getter for use in other modules
export { getCachedNip05Result };
