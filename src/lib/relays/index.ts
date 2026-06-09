import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, ensureCacheInitialized } from '../ndk';
import { RELAYS } from './config';
import { extendWithUserAndPremium, clearUserRelayCache } from './userDiscovery';
import { clearRelayInfoCache } from './infoCache';

export { RELAYS, createRelaySet } from './config';
export { discoverUserRelays, extendWithUserAndPremium } from './userDiscovery';
export { relayInfoCache, getRelayInfo, clearRelayInfoCache, type RelayInfo } from './infoCache';
export { checkNip50Support, filterNip50Relays, getNip50RelaySet, getNip50SearchRelaySet } from './nip50';

// Pre-configured relay sets
export const relaySets = {
  // Default relay set for general use
  default: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(await extendWithUserAndPremium(RELAYS.DEFAULT), ndk); },

  // Search relay set (NIP-50 capable)
  search: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(await extendWithUserAndPremium(RELAYS.SEARCH, { includeSearchRelays: true }), ndk); },

  // Profile search relay set
  profileSearch: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(await extendWithUserAndPremium(RELAYS.PROFILE_SEARCH, { includeSearchRelays: true }), ndk); },

  // Premium relay set, used only when logged in
  premium: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(RELAYS.PREMIUM, ndk); },

  // Vertex DVM relay set
  vertexDvm: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(RELAYS.VERTEX_DVM, ndk); }
} as const;

export function clearRelayCaches(): void {
  clearRelayInfoCache();
  clearUserRelayCache();
}
