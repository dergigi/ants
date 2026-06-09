import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../nip07';
import { RELAYS, createRelaySet } from './config';
import { getRelayInfo } from './infoCache';
import { discoverUserRelays, extendWithUserAndPremium } from './userDiscovery';

// Check whether a relay supports NIP-50
export async function checkNip50Support(relayUrl: string): Promise<{ supportsNip50: boolean; supportedNips: number[] }> {
  const relayInfo = await getRelayInfo(relayUrl);

  if (relayInfo.supportedNips) {
    const supportsNip50 = relayInfo.supportedNips.includes(50);
    return {
      supportsNip50,
      supportedNips: relayInfo.supportedNips
    };
  }

  return { supportsNip50: false, supportedNips: [] };
}

// Filter relays to only those supporting NIP-50
export async function filterNip50Relays(relayUrls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    relayUrls.map(async (url) => {
      const nip50Info = await checkNip50Support(url);
      return { url, nip50Info };
    })
  );

  const supportedRelays: string[] = [];
  const rejectedRelays: string[] = [];

  results.forEach((result, index) => {
    const url = relayUrls[index];
    if (result.status === 'fulfilled' && result.value.nip50Info.supportsNip50) {
      supportedRelays.push(url);
    } else {
      rejectedRelays.push(url);
    }
  });

  // If we have very few NIP-50 relays, fall back to unchecked candidates from
  // the curated search relay set, but only after verifying NIP-50 support
  if (supportedRelays.length < 3) {
    const fallbackCandidates = RELAYS.SEARCH.filter(
      (url) => !supportedRelays.includes(url) && !rejectedRelays.includes(url)
    );

    const fallbackResults = await Promise.allSettled(
      fallbackCandidates.map(async (url) => {
        const nip50Info = await checkNip50Support(url);
        return { url, supportsNip50: nip50Info.supportsNip50 };
      })
    );

    fallbackResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.supportsNip50) {
        supportedRelays.push(result.value.url);
      }
    });
  }

  return supportedRelays;
}

// Get NIP-50 capable relay set from a list of URLs
export async function getNip50RelaySet(relayUrls: string[]): Promise<NDKRelaySet> {
  const nip50Relays = await filterNip50Relays(relayUrls);
  return createRelaySet(nip50Relays);
}

// Enhanced search relay set that filters for NIP-50 support
export async function getNip50SearchRelaySet(): Promise<NDKRelaySet> {
  const pubkey = getStoredPubkey();

  // Start with hardcoded search relays
  const allSearchRelays: string[] = [...RELAYS.SEARCH];

  // Add user's search relays if logged in
  if (pubkey) {
    try {
      const { searchRelays } = await discoverUserRelays(pubkey);
      allSearchRelays.push(...searchRelays);
    } catch (error) {
      console.warn('[NIP-51] Failed to discover user search relays:', error);
    }
  }

  // Get all relays (including user relays) but filter for NIP-50 support
  const allRelays = await extendWithUserAndPremium(allSearchRelays);

  const nip50Relays = await filterNip50Relays(allRelays);

  return createRelaySet(nip50Relays);
}
