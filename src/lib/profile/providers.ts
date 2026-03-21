import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { Event, getEventHash } from 'nostr-tools';
import { RelatrClient } from '@/ctxcn/RelatrClient';
import { ndk } from '../ndk';
import { getCachedDvm, setCachedDvm } from './cache';
import { queryVertexDVM } from './dvm-core';

export type ProfileLookupProvider = 'vertex' | 'relatr' | 'relay';

const DEFAULT_PROVIDER_ORDER: ProfileLookupProvider[] = ['vertex', 'relatr', 'relay'];
const PROFILE_PROVIDER_ENV = process.env.NEXT_PUBLIC_PROFILE_LOOKUP_PROVIDERS;

type ProviderQueryResult = {
  events: NDKEvent[];
  provider: Exclude<ProfileLookupProvider, 'relay'>;
};

function makeProviderCacheKey(provider: Exclude<ProfileLookupProvider, 'relay'>, query: string): string {
  return `${provider}:${query.toLowerCase()}`;
}

function getConfiguredProviders(): ProfileLookupProvider[] {
  const raw = PROFILE_PROVIDER_ENV;
  if (!raw) return DEFAULT_PROVIDER_ORDER.slice();

  const parsed = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is ProfileLookupProvider => part === 'vertex' || part === 'relatr' || part === 'relay');

  const deduped = Array.from(new Set(parsed));
  if (deduped.length === 0) return DEFAULT_PROVIDER_ORDER.slice();
  if (!deduped.includes('relay')) deduped.push('relay');
  return deduped;
}

export function getProfileLookupProviderOrder(loggedIn: boolean): ProfileLookupProvider[] {
  const configured = getConfiguredProviders();
  if (loggedIn) return configured;
  return configured.filter((provider) => provider !== 'vertex');
}

function buildProfileEvent(pubkey: string, rank: number): NDKEvent {
  const user = new NDKUser({ pubkey });
  user.ndk = ndk;

  const plain: Event = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify(user.profile || {}),
    pubkey,
    tags: [],
    id: '',
    sig: ''
  };
  plain.id = getEventHash(plain);

  const event = new NDKEvent(ndk, plain);
  event.author = user;
  (event as NDKEvent & { debugScore?: string }).debugScore = `Provider-ranked result (#${rank + 1})`;
  return event;
}

async function queryRelatrProfiles(query: string, limit: number): Promise<NDKEvent[]> {
  const key = makeProviderCacheKey('relatr', query);
  const cached = getCachedDvm(key);
  if (cached !== undefined) {
    return (cached || []).slice(0, Math.max(0, limit));
  }

  const client = new RelatrClient();

  try {
    const response = await client.SearchProfiles(query, Math.max(1, limit), true);
    const events = (response.results || [])
      .slice(0, Math.max(1, limit))
      .map((result, index) => buildProfileEvent(result.pubkey, index));

    await Promise.allSettled(events.map((event) => event.author?.fetchProfile()));
    for (const [index, event] of events.entries()) {
      event.content = JSON.stringify(event.author?.profile || {});
      (event as NDKEvent & { debugScore?: string }).debugScore = `relatr rank #${index + 1}`;
    }
    setCachedDvm(key, events);
    return events;
  } catch (error) {
    setCachedDvm(key, null);
    throw error;
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

export async function queryProviderProfiles(
  query: string,
  limit: number,
  provider: Exclude<ProfileLookupProvider, 'relay'>
): Promise<ProviderQueryResult> {
  if (provider === 'vertex') {
    const events = await queryVertexDVM(query, limit);
    return { events, provider };
  }

  const events = await queryRelatrProfiles(query, limit);
  return { events, provider };
}
