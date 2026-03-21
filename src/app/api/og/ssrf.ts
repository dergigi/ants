import { isIP } from 'net';
import { lookup } from 'dns/promises';
import http from 'http';
import https from 'https';

/**
 * Check whether an IP address belongs to a private, loopback, or otherwise
 * internal range that must never be reached by the OG-metadata proxy.
 *
 * Handles:
 *  - Standard IPv4 private ranges (RFC 1918, loopback, link-local, etc.)
 *  - IPv6 loopback, link-local, unique-local
 *  - IPv6-mapped IPv4 in both dotted-quad (::ffff:127.0.0.1) and
 *    hex form (::ffff:7f00:1) — the latter is what Node's WHATWG URL
 *    parser produces.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 ranges
  const parts = ip.split('.').map((x) => parseInt(x, 10));
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 0) return true; // 0.0.0.0/8
  }

  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local

  // IPv6-mapped IPv4 — dotted-quad form (e.g. ::ffff:127.0.0.1)
  const v4mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mappedDotted) return isPrivateIp(v4mappedDotted[1]);

  // IPv6-mapped IPv4 — hex form (e.g. ::ffff:7f00:1 for 127.0.0.1)
  // Node's WHATWG URL parser normalises [::ffff:A.B.C.D] to ::ffff:XXYY:ZZWW
  const v4mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4mappedHex) {
    const hi = parseInt(v4mappedHex[1], 16);
    const lo = parseInt(v4mappedHex[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return isPrivateIp(`${a}.${b}.${c}.${d}`);
  }

  return false;
}

/**
 * Resolve a hostname to an IP, validate it is not private/internal, and
 * return the validated address so callers can pin subsequent requests to it.
 *
 * This closes the TOCTOU gap: the same IP that was validated is the one
 * used for the outbound connection (via {@link createPinnedAgent}).
 */
export async function validateAndResolveIp(hostname: string): Promise<string> {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Blocked IP');
    return hostname;
  }
  try {
    const { address } = await lookup(hostname);
    if (isPrivateIp(address)) {
      throw new Error('Blocked IP');
    }
    return address;
  } catch (e) {
    if (e instanceof Error && e.message === 'Blocked IP') throw e;
    throw new Error('DNS resolution failed');
  }
}

/**
 * Build an http(s).Agent whose `lookup` callback always returns the
 * pre-validated IP address, preventing the runtime from re-resolving DNS
 * (which would re-open a TOCTOU / rebinding window).
 */
export function createPinnedAgent(
  protocol: string,
  pinnedIp: string,
): http.Agent | https.Agent {
  const opts = {
    lookup: (
      _hostname: string,
      _options: object,
      cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ) => {
      const family = pinnedIp.includes(':') ? 6 : 4;
      cb(null, pinnedIp, family);
    },
  };
  return protocol === 'https:'
    ? new https.Agent(opts)
    : new http.Agent(opts);
}

/**
 * Validate a redirect target URL against the same SSRF rules.
 * Throws if the redirect is not safe.
 */
export async function validateRedirectTarget(location: string): Promise<void> {
  let target: URL;
  try {
    target = new URL(location);
  } catch {
    throw new Error('Invalid redirect URL');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Blocked redirect protocol');
  }
  const blockedNames = ['localhost', '0.0.0.0'];
  const lower = target.hostname.toLowerCase();
  if (
    blockedNames.includes(lower) ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local')
  ) {
    throw new Error('Blocked redirect host');
  }
  await validateAndResolveIp(target.hostname);
}
