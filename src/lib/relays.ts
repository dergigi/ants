import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';

// Centralized relay configuration
export const RELAYS = {
  // Default relays for general NDK connection
  DEFAULT: [
    'wss://relay.primal.net',
    'wss://relay.snort.social',
    'wss://relay.ditto.pub'
  ],

  // Search-capable relays (NIP-50 support)
  SEARCH: [
    'wss://relay.ditto.pub'
  ],

  // Profile search relays (NIP-50 capable)
  PROFILE_SEARCH: [
    'wss://purplepag.es'
  ],

  // Vertex DVM relay
  VERTEX_DVM: [
    'wss://relay.vertexlab.io'
  ]
} as const;

// Pre-configured relay sets
export const relaySets = {
  // Default relay set for general use
  default: () => NDKRelaySet.fromRelayUrls(RELAYS.DEFAULT, ndk),
  
  // Search relay set (NIP-50 capable)
  search: () => NDKRelaySet.fromRelayUrls(RELAYS.SEARCH, ndk),
  
  // Profile search relay set
  profileSearch: () => NDKRelaySet.fromRelayUrls(RELAYS.PROFILE_SEARCH, ndk),
  
  // Vertex DVM relay set
  vertexDvm: () => NDKRelaySet.fromRelayUrls(RELAYS.VERTEX_DVM, ndk)
} as const;

// Helper function to create custom relay sets
export function createRelaySet(urls: string[]): NDKRelaySet {
  return NDKRelaySet.fromRelayUrls(urls, ndk);
}
