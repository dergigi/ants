import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ensureCacheInitialized, ndk } from '../ndk';
import { RELAYS } from './config';
import { extendWithUserAndPremium } from './userRelays';

export const relaySets = {
  default: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(await extendWithUserAndPremium(RELAYS.DEFAULT), ndk);
  },
  search: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(
      await extendWithUserAndPremium(RELAYS.SEARCH, { includeSearchRelays: true }),
      ndk
    );
  },
  profileSearch: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(
      await extendWithUserAndPremium(RELAYS.PROFILE_SEARCH, { includeSearchRelays: true }),
      ndk
    );
  },
  premium: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(RELAYS.PREMIUM, ndk);
  },
  vertexDvm: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(RELAYS.VERTEX_DVM, ndk);
  }
} as const;
