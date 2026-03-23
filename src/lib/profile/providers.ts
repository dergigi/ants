import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '../ndk';
import { getCachedDvm, setCachedDvm } from './cache';
import { queryVertexDVM } from './dvm-core';
import { buildProfileStubEvent, searchRelatrProfiles } from './relatr';

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

  const event = buildProfileStubEvent(pubkey, JSON.stringify(user.profile || {}));
  event.author = user;
  (event as NDKEvent & { debugScore?: string }).debugScore = `Provider-ranked result (#${rank + 1})`;
  return event;
}

async function queryRelatrProfiles(query: string, limit: number): Promise<NDKEvent[]> {
  const key = makeProviderCacheKey('relatr', query);
  const cached = getCachedDvm(key);
  if (cached !== undefined) {
    return (cached || []).slice(0, Math.max(1, limit));
  }

  try {
    const response = await searchRelatrProfiles(query, Math.max(1, limit), true);
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

// Try all configured providers in order; returns first successful result or null.
// When forcedProvider is set (via pp: keyword), only that provider is tried.
export async function tryQueryProviders(
  query: string,
  limit: number,
  loggedIn: boolean,
  forcedProvider?: string
): Promise<NDKEvent[] | null> {
  const providerOrder = forcedProvider
    ? [forcedProvider as ProfileLookupProvider]
    : getProfileLookupProviderOrder(loggedIn);
  for (const provider of providerOrder) {
    if (provider === 'relay') break;
    try {
      const providerEvents = await queryProviderProfiles(query, limit, provider);
      for (const [index, event] of providerEvents.events.entries()) {
        const label = providerEvents.provider === 'vertex' ? 'Vertex-ranked result' : 'relatr-ranked result';
        (event as unknown as { debugScore?: string }).debugScore = `${label} #${index + 1}`;
      }
      if (providerEvents.events.length > 0) return providerEvents.events;
    } catch (e) {
      console.warn(`${provider} profile aggregation failed, falling back:`, e);
    }
  }
  return null;
}
