// Centralized relay configuration, normalization, and private relay detection.

export const RELAYS = {
  DEFAULT: [
    'wss://relay.primal.net',
    'wss://relay.snort.social',
    'wss://relay.ditto.pub',
  ],
  SEARCH: [
    'wss://search.nos.today',
    'wss://relay.nostr.band',
    'wss://relay.ditto.pub',
    'wss://relay.davidebtc.me',
    'wss://relay.gathr.gives',
    'wss://nostr.polyserv.xyz',
    'wss://nostr.azzamo.net',
  ],
  PROFILE_SEARCH: [
    'wss://purplepag.es',
    'wss://search.nos.today',
    'wss://relay.nostr.band',
    'wss://relay.ditto.pub',
  ],
  PREMIUM: ['wss://nostr.wine'],
  VERTEX_DVM: ['wss://relay.vertexlab.io'],
} as const;

export function normalizeRelayUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

// Private/LAN hostname patterns. Connecting to these from a public origin
// is unreachable and triggers Chrome 147+ Local Network Access prompts (#216).
const PRIVATE_HOST_RE = /^(?:localhost|.*\.local|.*\.lan|.*\.home|.*\.internal)$/i;
const PRIVATE_IP_RE = /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?(?:::1|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:))/i;

export function isPrivateRelay(url: string): boolean {
  try {
    const hostname = new URL(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')).hostname;
    return PRIVATE_HOST_RE.test(hostname) || PRIVATE_IP_RE.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Add a relay URL to a set, skipping blocked and private relays.
 * Shared helper used by relay set construction functions.
 */
export function addRelayToSet(
  relaySet: Set<string>,
  url: string,
  blocked: Set<string>
): void {
  const normalized = normalizeRelayUrl(url);
  if (!normalized || blocked.has(normalized) || isPrivateRelay(normalized)) return;
  relaySet.add(normalized);
}
