import { NDKEvent } from '@nostr-dev-kit/ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '../storageCache';

// In-memory cache for DVM profile lookups: key=username(lower), value=array of profile events
type DvmCacheEntry = { events: NDKEvent[] | null; timestamp: number };
const DVM_CACHE = new Map<string, DvmCacheEntry>();
const DVM_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DVM_NEGATIVE_TTL_MS = 60 * 1000; // 1 minute for negative results
const DVM_CACHE_STORAGE_KEY = 'ants_dvm_cache_v1';

type DvmStoredRecord = {
  pubkey: string;
  profile?: { name?: string; displayName?: string; about?: string; nip05?: string; image?: string };
};

function serializeDvmEvents(events: NDKEvent[] | null): DvmStoredRecord[] {
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

function deserializeDvmEvents(records: DvmStoredRecord[]): NDKEvent[] {
  const { ndk } = require('../ndk');
  const { NDKUser } = require('@nostr-dev-kit/ndk');
  const { getEventHash } = require('nostr-tools');
  
  const events: NDKEvent[] = [];
  for (const rec of records) {
    const user = new NDKUser({ pubkey: rec.pubkey });
    user.ndk = ndk;
    if (rec.profile) {
      (user as NDKUser & { profile: typeof rec.profile }).profile = { ...rec.profile } as unknown as typeof rec.profile;
    }
    const plain: any = {
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
