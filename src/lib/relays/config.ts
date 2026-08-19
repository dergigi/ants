import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, ensureCacheInitialized } from '../ndk';

// Centralized relay configuration
export const RELAYS = {
  // Default relays for general NDK connection
  DEFAULT: [
    'wss://relay.primal.net',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://nostr.mom',
    'wss://offchain.pub',
    'wss://relay.ditto.pub'
  ],

  // Search-capable relays (NIP-50 support)
  SEARCH: [
    'wss://search.nos.today',
    'wss://relay.ditto.pub',
    'wss://antiprimal.net',
    'wss://nostr.me/relay',
    'wss://relay.crostr.com',
    'wss://wisp.solife.me',
    'wss://strfry.ymir.cloud',
    'wss://dragon-orange.exe.xyz',
    'wss://henhouse.social/relay'
  ],

  // Profile search relays (NIP-50 capable)
  PROFILE_SEARCH: [
    'wss://purplepag.es',
    'wss://search.nos.today',
    'wss://relay.ditto.pub',
    'wss://antiprimal.net'
  ],

  // Premium relays to use only for logged-in users
  PREMIUM: [
    'wss://nostr.wine'
  ],

  // Vertex DVM relay
  VERTEX_DVM: [
    'wss://relay.vertexlab.io'
  ],

  // Relays that carry NIP-66 relay discovery events
  NIP66_MONITORS: [
    'wss://relay.nostr.watch',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.ditto.pub'
  ]
} as const;

/** Normalize a relay URL: ensure wss:// scheme and strip trailing slashes */
export function normalizeRelayUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

// Helper function to create custom relay sets
export async function createRelaySet(urls: string[]): Promise<NDKRelaySet> {
  await ensureCacheInitialized();
  return NDKRelaySet.fromRelayUrls(urls, ndk);
}
