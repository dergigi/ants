/**
 * Public surface for Namecoin `.bit` NIP-05 resolution. Wraps the
 * low-level WSS resolver with session caching + concurrent-request
 * deduplication.
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
  const cached = getCachedNamecoinResolve(identifier);
  if (cached !== undefined) return cached;

  const inflight = getInflightNamecoinResolve(identifier);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const result = await queryProfile(identifier, servers);
      setCachedNamecoinResolve(identifier, result);
      return result;
    } catch {
      setCachedNamecoinResolve(identifier, null);
      return null;
    } finally {
      deleteInflightNamecoinResolve(identifier);
    }
  })();
  setInflightNamecoinResolve(identifier, p);
  return p;
}

/**
 * Verify that `pubkeyHex` is bound to `identifier` on the Namecoin
 * chain. Returns `false` on any failure.
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
  return rawIsValid(pubkeyHex, identifier);
}
