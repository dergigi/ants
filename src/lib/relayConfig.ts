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
    'wss://search.nostrarchives.com',
    'wss://antiprimal.net',
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
// Match full IPv4 literals only (anchored with $) to avoid false positives on
// DNS names like 10.example.com. Covers loopback, RFC 1918, link-local.
const PRIVATE_IPV4_RE = /^(?:127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|0\.0\.0\.0)$/;
// IPv6 loopback, link-local (fe80), and ULA (fc/fd) including compressed forms.
const PRIVATE_IPV6_RE = /^\[?(?:::1|fe80:|f[cd][0-9a-f]{0,2}:)/i;

/** Returns true if a relay URL points to a private/LAN address. */
export function isPrivateRelay(url: string): boolean {
  try {
    const hostname = new URL(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')).hostname;
    return PRIVATE_HOST_RE.test(hostname) || PRIVATE_IPV4_RE.test(hostname) || PRIVATE_IPV6_RE.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Add a relay URL to a set, skipping blocked and private relays.
 * Pass allowPrivate=true for the logged-in user's own relays when
 * the "search local relays" setting is enabled.
 */
export function addRelayToSet(
  relaySet: Set<string>,
  url: string,
  blocked: Set<string>,
  allowPrivate = false
): void {
  const normalized = normalizeRelayUrl(url);
  if (!normalized || blocked.has(normalized)) return;
  if (!allowPrivate && isPrivateRelay(normalized)) return;
  relaySet.add(normalized);
}
