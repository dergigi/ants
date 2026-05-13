import type { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../authStorage';
import { RELAYS } from './config';
import { createRelaySet } from './factory';
import { checkNip50Support, getRelayInfo } from './relayInfo';
import { discoverUserRelays, extendWithUserAndPremium } from './userRelays';

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

export async function getNip50RelaySet(relayUrls: string[]): Promise<NDKRelaySet> {
  const nip50Relays = await filterNip50Relays(relayUrls);
  return createRelaySet(nip50Relays);
}

export async function getNip50SearchRelaySet(): Promise<NDKRelaySet> {
  const pubkey = getStoredPubkey();
  const allSearchRelays: string[] = [...RELAYS.SEARCH];

  if (pubkey) {
    try {
      const { searchRelays } = await discoverUserRelays(pubkey);
      allSearchRelays.push(...searchRelays);
    } catch (error) {
      console.warn('[NIP-51] Failed to discover user search relays:', error);
    }
  }

  const allRelays = await extendWithUserAndPremium(allSearchRelays);
  const nip50Relays = await filterNip50Relays(allRelays);

  for (const relayUrl of nip50Relays) {
    try {
      await getRelayInfo(relayUrl);
    } catch {
      // ignore
    }
  }

  return createRelaySet(nip50Relays);
}
