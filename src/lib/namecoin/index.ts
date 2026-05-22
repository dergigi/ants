/**
 * Public surface for Namecoin `.bit` NIP-05 resolution. Wraps the
 * low-level WSS resolver with session caching + concurrent-request
 * deduplication.
 *
 * Cache + inflight keys incorporate a fingerprint of the `servers`
 * argument so calls with different server sets do not contaminate
 * each other (e.g. a Node-side route hitting one operator should
 * never satisfy a browser-side lookup that explicitly targets a
 * different set).
 */
import {
  queryProfile,
  isValid as rawIsValid,
  isValidIdentifier,
  isDotBit,
  parseIdentifier,
  type NamecoinResolveResult,
  type ElectrumXServer,
  DEFAULT_ELECTRUMX_SERVERS,
  useWebSocketImplementation,
} from './nip05';
import {
  getCachedNamecoinResolve,
  setCachedNamecoinResolve,
  getInflightNamecoinResolve,
  setInflightNamecoinResolve,
  deleteInflightNamecoinResolve,
} from './cache';

export {
  isValidIdentifier,
  isDotBit,
  parseIdentifier,
  DEFAULT_ELECTRUMX_SERVERS,
  useWebSocketImplementation,
};
export type { NamecoinResolveResult, ElectrumXServer };

/**
 * Resolve a `.bit` / `d/` / `id/` identifier with session caching.
 * Returns `null` on any failure path.
 */
export async function resolveNamecoinNip05(
  identifier: string,
  servers?: ElectrumXServer[],
): Promise<NamecoinResolveResult | null> {
  const cached = getCachedNamecoinResolve(identifier, servers);
  if (cached !== undefined) return cached;

  const inflight = getInflightNamecoinResolve(identifier, servers);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const result = await queryProfile(identifier, servers);
      setCachedNamecoinResolve(identifier, result, servers);
      return result;
    } catch {
      setCachedNamecoinResolve(identifier, null, servers);
      return null;
    } finally {
      deleteInflightNamecoinResolve(identifier, servers);
    }
  })();
  setInflightNamecoinResolve(identifier, p, servers);
  return p;
}

/**
 * Verify that `pubkeyHex` is bound to `identifier` on the Namecoin
 * chain. Returns `false` on any failure. Honours `servers` on both
 * the cached-resolve path and the raw-fallback path so behaviour
 * does not diverge from the caller's input.
 */
export async function isValidNamecoinNip05(
  pubkeyHex: string,
  identifier: string,
  servers?: ElectrumXServer[],
): Promise<boolean> {
  if (!pubkeyHex || !identifier) return false;
  // Prefer cached resolution to avoid duplicate WSS hits.
  const res = await resolveNamecoinNip05(identifier, servers);
  if (res) return res.pubkey.toLowerCase() === pubkeyHex.toLowerCase();
  // Fall back to the raw path so callers can still verify with custom servers.
  return rawIsValid(pubkeyHex, identifier, servers);
}
