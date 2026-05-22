/**
 * Session-level in-memory cache for Namecoin `.bit` NIP-05 resolutions.
 * Survives across components within a single browser/server session,
 * does not persist to localStorage. No TTL — entries live for the
 * lifetime of the runtime.
 *
 * Keys are composite: `<normalized-identifier>|<servers-fingerprint>`
 * so a lookup against one ElectrumX server set never returns a result
 * that was produced by a different set.
 */
import type { ElectrumXServer } from './transport';
import type { NamecoinResolveResult } from './value';

const POS_CACHE = new Map<string, NamecoinResolveResult>();
const NEG_CACHE = new Set<string>();
const INFLIGHT = new Map<string, Promise<NamecoinResolveResult | null>>();

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/**
 * Stable fingerprint for a server list. `undefined` (the caller's
 * "use defaults" sentinel) maps to a dedicated bucket so it never
 * collides with an explicit list that happens to equal the defaults.
 */
function serversFingerprint(servers: ElectrumXServer[] | undefined): string {
  if (servers === undefined) return 'default';
  return servers
    .map((s) => `${s.host}:${s.port}${s.path ?? '/'}`)
    .join(',');
}

function cacheKey(identifier: string, servers: ElectrumXServer[] | undefined): string {
  return `${normalizeIdentifier(identifier)}|${serversFingerprint(servers)}`;
}

export function getCachedNamecoinResolve(
  identifier: string,
  servers?: ElectrumXServer[],
): NamecoinResolveResult | null | undefined {
  const key = cacheKey(identifier, servers);
  if (POS_CACHE.has(key)) return POS_CACHE.get(key)!;
  if (NEG_CACHE.has(key)) return null;
  return undefined;
}

export function setCachedNamecoinResolve(
  identifier: string,
  result: NamecoinResolveResult | null,
  servers?: ElectrumXServer[],
): void {
  const key = cacheKey(identifier, servers);
  if (result) {
    POS_CACHE.set(key, result);
    NEG_CACHE.delete(key);
  } else {
    NEG_CACHE.add(key);
    POS_CACHE.delete(key);
  }
}

export function getInflightNamecoinResolve(
  identifier: string,
  servers?: ElectrumXServer[],
): Promise<NamecoinResolveResult | null> | undefined {
  return INFLIGHT.get(cacheKey(identifier, servers));
}

export function setInflightNamecoinResolve(
  identifier: string,
  p: Promise<NamecoinResolveResult | null>,
  servers?: ElectrumXServer[],
): void {
  INFLIGHT.set(cacheKey(identifier, servers), p);
}

export function deleteInflightNamecoinResolve(
  identifier: string,
  servers?: ElectrumXServer[],
): void {
  INFLIGHT.delete(cacheKey(identifier, servers));
}
