import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, ensureCacheInitialized } from '../ndk';

// Centralized relay configuration
export const RELAYS = {
  // Default relays for general NDK connection
  DEFAULT: [
    'wss://relay.primal.net',
    'wss://relay.ditto.pub',
    'wss://nos.lol'
  ],

  // Search-capable relays (NIP-50 support)
  SEARCH: [
    'wss://search.nos.today',
    'wss://relay.ditto.pub',
    'wss://relay.gathr.gives',
    'wss://antiprimal.net',
    'wss://index.hzrd149.com',
    'wss://nostr.me/relay',
    'wss://relay.vertexlab.io'
  ],

  // Profile search relays (NIP-50 capable)
  PROFILE_SEARCH: [
    'wss://purplepag.es',
    'wss://search.nos.today',
    'wss://relay.ditto.pub',
    'wss://relay.vertexlab.io',
    'wss://antiprimal.net'
  ],

  // Premium relays to use only for logged-in users
  PREMIUM: [
    'wss://nostr.wine'
  ],

  // Vertex DVM relay
  VERTEX_DVM: [
    'wss://relay.vertexlab.io'
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
