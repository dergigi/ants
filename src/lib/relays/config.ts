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
  ],

  // NIP-66 monitor event authors that currently publish useful relay data
  NIP66_MONITOR_AUTHORS: [
    '45df0580711f37c547270480d7aed2c7fc03ba5a4f8fef5a8787db0b19343de0',
    '54b9e0a6f3c73c59d777cc7b9b948a7b9628e238c0d46cc31b71b1d6c7226baf',
    '6d9717bc8758ddf99bc1b0e325d60bf5c41418dc122d81de6cd1a35138e51fe3'
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
