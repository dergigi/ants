/**
 * Session-level in-memory cache for Namecoin `.bit` NIP-05 resolutions.
 * Survives across components within a single browser/server session,
 * does not persist to localStorage. No TTL — entries live for the
 * lifetime of the runtime.
 */
import type { NamecoinResolveResult } from './nip05';

const POS_CACHE = new Map<string, NamecoinResolveResult>();
const NEG_CACHE = new Set<string>();
const INFLIGHT = new Map<string, Promise<NamecoinResolveResult | null>>();

function normalizeKey(identifier: string): string {
  return identifier.trim().toLowerCase();
}

export function getCachedNamecoinResolve(identifier: string): NamecoinResolveResult | null | undefined {
  const key = normalizeKey(identifier);
  if (POS_CACHE.has(key)) return POS_CACHE.get(key)!;
  if (NEG_CACHE.has(key)) return null;
  return undefined;
}

export function setCachedNamecoinResolve(
  identifier: string,
  result: NamecoinResolveResult | null,
): void {
  const key = normalizeKey(identifier);
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
): Promise<NamecoinResolveResult | null> | undefined {
  return INFLIGHT.get(normalizeKey(identifier));
}

export function setInflightNamecoinResolve(
  identifier: string,
  p: Promise<NamecoinResolveResult | null>,
): void {
  INFLIGHT.set(normalizeKey(identifier), p);
}

export function deleteInflightNamecoinResolve(identifier: string): void {
  INFLIGHT.delete(normalizeKey(identifier));
}
