import { nip05 as nostrNip05 } from 'nostr-tools';
import { normalizeNip05String, isRootNip05 } from '../nip05';
import { 
  getCachedNip05Result, 
  setCachedNip05Result, 
  invalidateNip05Cache,
  getNip05InFlightPromise,
  setNip05InFlightPromise,
  deleteNip05InFlightPromise
} from './cache';

// Resolve NIP-05 identifier to pubkey
export async function resolveNip05ToPubkey(nip05: string): Promise<string | null> {
  try {
    const input = nip05.trim();
    const cleaned = input.startsWith('@') ? input.slice(1) : input;
    const [nameRaw, domainRaw] = cleaned.includes('@') ? cleaned.split('@') : ['_', cleaned];
    const name = nameRaw || '_';
    const domain = (domainRaw || '').trim();
    if (!domain) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const mapped = (data?.names?.[name] as string | undefined) || null;
    return mapped;
  } catch {
    return null;
  }
}

// Verify NIP-05 via API endpoint
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

// Verify NIP-05 with caching and deduplication
export async function verifyNip05(pubkeyHex: string, nip05?: string): Promise<boolean> {
  if (!nip05) return false;
  const normalized = normalizeNip05String(nip05);
  if (!normalized) return false;
  const cacheKey = `${normalized}|${pubkeyHex}`;

  // 1) Memory cache
  const cached = getCachedNip05Result(pubkeyHex, nip05);
  if (cached !== null) return cached;

  // 2) Dedupe concurrent verifications
  const inFlight = getNip05InFlightPromise(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      // Try server-side endpoint to avoid CORS from browser
      const okApi = await verifyNip05ViaApi(pubkeyHex, normalized);
      if (okApi !== false) {
        setCachedNip05Result(pubkeyHex, nip05, okApi);
        return okApi;
      }
    } catch {}
    try {
      // Fallback to direct nostr-tools check
      const ok = await nostrNip05.isValid(pubkeyHex, normalized as `${string}@${string}`);
      setCachedNip05Result(pubkeyHex, nip05, ok);
      return ok;
    } catch {}
    // Record negative with timestamp to avoid thrash
    setCachedNip05Result(pubkeyHex, nip05, false);
    return false;
  })();

  setNip05InFlightPromise(cacheKey, promise);
  try {
    return await promise;
  } finally {
    deleteNip05InFlightPromise(cacheKey);
  }
}

// Check NIP-05 using cache; does not invalidate
export async function checkNip05(pubkeyHex: string, nip05: string): Promise<boolean> {
  return verifyNip05(pubkeyHex, nip05);
}

// Invalidate one cached NIP-05 verification entry
export function invalidateNip05CacheEntry(pubkeyHex: string, nip05: string): void {
  invalidateNip05Cache(pubkeyHex, nip05);
}

// Re-export isRootNip05 from main nip05 module
export { isRootNip05 };
