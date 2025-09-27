import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { getEventHash } from 'nostr-tools';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '../storageCache';
import { normalizeNip05String } from '../nip05';
import { ndk } from '../ndk';

// DVM Cache types and constants
export type DvmCacheEntry = { events: NDKEvent[] | null; timestamp: number };
export type DvmStoredRecord = {
  pubkey: string;
  profile?: { name?: string; displayName?: string; about?: string; nip05?: string; image?: string };
};

const DVM_CACHE = new Map<string, DvmCacheEntry>();
const DVM_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DVM_NEGATIVE_TTL_MS = 60 * 1000; // 1 minute for negative results
const DVM_CACHE_STORAGE_KEY = 'ants_dvm_cache_v1';

// NIP-05 Cache types and constants
const NIP05_CACHE_STORAGE_KEY = 'ants_nip05_cache_v1';
type Nip05CacheValue = { ok: boolean; timestamp: number };
const NIP05_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const nip05VerificationCache = new Map<string, boolean>();
const nip05PersistentCache: Map<string, Nip05CacheValue> = loadMapFromStorage<Nip05CacheValue>(NIP05_CACHE_STORAGE_KEY);

// NIP-05 string cache (store latest nip05 value per pubkey)
const NIP05_STRING_CACHE_STORAGE_KEY = 'ants_nip05_strings_v1';
type Nip05StringCacheValue = { value: string | null; timestamp: number };
const nip05StringCache = new Map<string, Nip05StringCacheValue>();
const nip05StringPersistentCache: Map<string, Nip05StringCacheValue> = loadMapFromStorage<Nip05StringCacheValue>(NIP05_STRING_CACHE_STORAGE_KEY);

for (const [key, value] of nip05StringPersistentCache.entries()) {
  nip05StringCache.set(key, value);
}

// Track in-flight verification promises to dedupe concurrent calls
const nip05InFlight = new Map<string, Promise<boolean>>();


// DVM Cache functions
export function getCachedDvm(usernameLower: string): NDKEvent[] | null | undefined {
  const entry = DVM_CACHE.get(usernameLower);
  if (!entry) return undefined;
  const ttl = entry.events && entry.events.length > 0 ? DVM_CACHE_TTL_MS : DVM_NEGATIVE_TTL_MS;
  if (Date.now() - entry.timestamp > ttl) {
    DVM_CACHE.delete(usernameLower);
    return undefined;
  }
  return entry.events;
}

export function setCachedDvm(usernameLower: string, events: NDKEvent[] | null): void {
  DVM_CACHE.set(usernameLower, { events, timestamp: Date.now() });
  saveDvmCacheToStorage();
}

export function serializeDvmEvents(events: NDKEvent[] | null): DvmStoredRecord[] {
  if (!events || events.length === 0) return [];
  const records: DvmStoredRecord[] = [];
  for (const evt of events) {
    const pubkey = (evt.pubkey || evt.author?.pubkey || '').trim();
    if (!pubkey) continue;
    const fields = extractProfileFields(evt);
    const profile: { name?: string; displayName?: string; about?: string; nip05?: string; image?: string } | undefined = (
      fields.name || fields.display || fields.about || fields.nip05 || fields.image
    ) ? {
      name: fields.name,
      displayName: fields.display,
      about: fields.about,
      nip05: fields.nip05,
      image: fields.image
    } : undefined;
    records.push({ pubkey, profile });
  }
  return records;
}

export function deserializeDvmEvents(records: DvmStoredRecord[]): NDKEvent[] {
  const events: NDKEvent[] = [];
  for (const rec of records) {
    const user = new NDKUser({ pubkey: rec.pubkey });
    user.ndk = ndk;
    if (rec.profile) {
    (user as NDKUser & { profile: typeof rec.profile }).profile = { ...rec.profile } as typeof rec.profile;
    }
    const plain = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify({
        name: rec.profile?.name,
        display_name: rec.profile?.displayName || rec.profile?.name,
        about: rec.profile?.about,
        nip05: rec.profile?.nip05,
        image: rec.profile?.image
      }),
      pubkey: rec.pubkey,
      tags: [],
      id: '',
      sig: ''
    };
    plain.id = getEventHash(plain);
    const evt = new NDKEvent(ndk, plain);
    evt.author = user;
    events.push(evt);
  }
  return events;
}

function saveDvmCacheToStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const out = new Map<string, { records: DvmStoredRecord[]; timestamp: number }>();
    for (const [key, entry] of DVM_CACHE.entries()) {
      const records = serializeDvmEvents(entry.events);
      out.set(key, { records, timestamp: entry.timestamp });
    }
    saveMapToStorage(DVM_CACHE_STORAGE_KEY, out);
  } catch {
    // ignore
  }
}

function loadDvmCacheFromStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const loaded = loadMapFromStorage<{ records: DvmStoredRecord[]; timestamp: number }>(DVM_CACHE_STORAGE_KEY);
    for (const [key, stored] of loaded.entries()) {
      const events = deserializeDvmEvents(stored.records || []);
      DVM_CACHE.set(key, { events, timestamp: stored.timestamp || Date.now() });
    }
  } catch {
    // ignore
  }
}

// Initialize persistent DVM cache on module load (browser only)
loadDvmCacheFromStorage();

// NIP-05 Cache functions
export function getCachedNip05Result(pubkeyHex: string, nip05?: string): boolean | null {
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

export function setCachedNip05Result(pubkeyHex: string, nip05: string, result: boolean): void {
  const key = nip05CacheKey(pubkeyHex, nip05);
  nip05VerificationCache.set(key, result);
  nip05PersistentCache.set(key, { ok: result, timestamp: Date.now() });
  if (hasLocalStorage()) saveMapToStorage(NIP05_CACHE_STORAGE_KEY, nip05PersistentCache);
}

export function getCachedNip05String(pubkeyHex: string): string | null | undefined {
  const key = normalizePubkey(pubkeyHex);
  if (!key) return undefined;
  const now = Date.now();
  const cached = nip05StringCache.get(key);
  if (cached) {
    if (now - cached.timestamp <= NIP05_TTL_MS) return cached.value;
    nip05StringCache.delete(key);
  }
  const persisted = nip05StringPersistentCache.get(key);
  if (!persisted) return undefined;
  if (now - persisted.timestamp > NIP05_TTL_MS) {
    nip05StringPersistentCache.delete(key);
    if (hasLocalStorage()) saveMapToStorage(NIP05_STRING_CACHE_STORAGE_KEY, nip05StringPersistentCache);
    return undefined;
  }
  nip05StringCache.set(key, persisted);
  return persisted.value;
}

export function setCachedNip05String(pubkeyHex: string, nip05?: string | null): void {
  const key = normalizePubkey(pubkeyHex);
  if (!key) return;
  const normalizedValue = typeof nip05 === 'string'
    ? normalizeNip05String(nip05) ?? nip05
    : null;
  const entry: Nip05StringCacheValue = { value: normalizedValue, timestamp: Date.now() };
  nip05StringCache.set(key, entry);
  nip05StringPersistentCache.set(key, entry);
  if (hasLocalStorage()) saveMapToStorage(NIP05_STRING_CACHE_STORAGE_KEY, nip05StringPersistentCache);
}

export function invalidateCachedNip05String(pubkeyHex: string): void {
  const key = normalizePubkey(pubkeyHex);
  if (!key) return;
  nip05StringCache.delete(key);
  nip05StringPersistentCache.delete(key);
  if (hasLocalStorage()) saveMapToStorage(NIP05_STRING_CACHE_STORAGE_KEY, nip05StringPersistentCache);
}

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

export function getNip05InFlightPromise(cacheKey: string): Promise<boolean> | undefined {
  return nip05InFlight.get(cacheKey);
}

export function setNip05InFlightPromise(cacheKey: string, promise: Promise<boolean>): void {
  nip05InFlight.set(cacheKey, promise);
}

export function deleteNip05InFlightPromise(cacheKey: string): void {
  nip05InFlight.delete(cacheKey);
}

function nip05CacheKey(pubkeyHex: string, nip05: string): string {
  const normalized = normalizeNip05String(nip05);
  return `${normalized}|${pubkeyHex}`;
}

export function normalizePubkey(pubkeyHex: string | undefined | null): string | null {
  if (!pubkeyHex) return null;
  try {
    return pubkeyHex.trim().toLowerCase();
  } catch {
    return null;
  }
}


// Helper function to extract profile fields from an event
function extractProfileFields(event: NDKEvent): { name?: string; display?: string; about?: string; nip05?: string; image?: string } {
  try {
    const content = JSON.parse(event.content || '{}');
    return {
      name: content.name,
      display: content.display_name || content.displayName,
      about: content.about,
      nip05: content.nip05,
      image: content.image || content.picture
    };
  } catch {
    return {};
  }
}
