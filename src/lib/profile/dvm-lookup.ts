import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../nip07';
import { VERTEX_REGEXP } from './dvm-core';
import { getProfileLookupProviderOrder, queryProviderProfiles } from './providers';

// Lookup profile using configured providers with fallback
export async function lookupVertexProfile(query: string, fallbackLookup: (username: string) => Promise<NDKEvent | null>): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();
  const providerOrder = getProfileLookupProviderOrder(Boolean(getStoredPubkey()));

  // If no remote providers are enabled, skip directly to fallback
  if (!providerOrder.some((provider) => provider !== 'relay')) {
    try { return await fallbackLookup(username); } catch { return null; }
  }

  const providerPromises: Array<Promise<NDKEvent | null>> = providerOrder
    .filter((provider) => provider !== 'relay')
    .map((provider) => (async () => {
      try {
        const events = await queryProviderProfiles(username, 1, provider);
        return events.events[0] ?? null;
      } catch (error) {
        console.warn(`${provider} profile lookup failed, will rely on fallback if available:`, error);
        return null;
      }
    })());

  const fallbackPromise: Promise<NDKEvent | null> = fallbackLookup(username).catch((e) => {
    console.error('Fallback profile lookup failed:', e);
    return null;
  });

  const nonNullOrReject = <T,>(promise: Promise<T | null>) => promise.then((value) => {
    if (value === null) throw new Error('no result');
    return value;
  });

  try {
    return await Promise.any(providerPromises.map((promise) => nonNullOrReject(promise)));
  } catch {}

  // Providers produced no usable result; rely on fallback before giving up.
  const fallbackResult = await fallbackPromise;
  if (fallbackResult) return fallbackResult;

  const providerResults = await Promise.all(providerPromises);
  return providerResults.find(Boolean) || null;
}
