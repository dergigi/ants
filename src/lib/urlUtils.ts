/**
 * Centralized URL normalization utilities
 * Handles all relay URL normalization consistently across the codebase
 */

import { NDKEvent } from '@nostr-dev-kit/ndk';

/**
 * Normalizes a relay URL to a consistent format for comparison and storage
 * - Removes trailing slashes
 * - Ensures consistent scheme (wss://)
 * - Handles edge cases like empty strings and malformed URLs
 */
export function normalizeRelayUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Trim whitespace
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  // Ensure it has a scheme
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  
  // Remove trailing slashes
  const normalized = withScheme.replace(/\/+$/, '');
  
  return normalized;
}

/**
 * Creates a canonical identifier for a relay URL
 * Used for consistent deduplication and comparison
 */
export function canonicalRelayId(url: string | undefined | null): string {
  const normalized = normalizeRelayUrl(url);
  if (!normalized) {
    return '';
  }

  try {
    const urlObj = new URL(normalized);
    const hostname = (urlObj.hostname || '').toLowerCase();
    const path = (urlObj.pathname || '').replace(/\/+$/g, '');
    return `${hostname}${path}`;
  } catch {
    // Fallback: use normalized URL as-is
    return normalized.toLowerCase();
  }
}

/**
 * Checks if two relay URLs refer to the same relay
 * Handles all the edge cases like trailing slashes, different schemes, etc.
 */
export function areRelayUrlsEqual(url1: string | undefined | null, url2: string | undefined | null): boolean {
  const normalized1 = normalizeRelayUrl(url1);
  const normalized2 = normalizeRelayUrl(url2);
  
  if (!normalized1 || !normalized2) {
    return normalized1 === normalized2;
  }
  
  return normalized1 === normalized2;
}

/**
 * Extracts relay sources from an NDKEvent
 * Returns normalized URLs for consistent comparison
 */
export function extractRelaySourcesFromEvent(event: NDKEvent): string[] {
  const eventWithSources = event as NDKEvent & {
    relaySource?: string;
    relaySources?: string[];
  };
  
  // Prioritize relaySources array if it exists, otherwise use relaySource
  if (Array.isArray(eventWithSources.relaySources) && eventWithSources.relaySources.length > 0) {
    // Use relaySources array (complete list)
    const normalizedSources = eventWithSources.relaySources
      .map(url => normalizeRelayUrl(url))
      .filter(url => url.length > 0);
    
    // Remove duplicates using Set
    return Array.from(new Set(normalizedSources));
  } else if (typeof eventWithSources.relaySource === 'string') {
    // Fallback to single relaySource
    const normalizedUrl = normalizeRelayUrl(eventWithSources.relaySource);
    return normalizedUrl ? [normalizedUrl] : [];
  }
  
  return [];
}

/**
 * Creates a Set of normalized relay URLs from an array
 * Useful for efficient lookups and comparisons
 */
export function createRelaySet(urls: (string | undefined | null)[]): Set<string> {
  const set = new Set<string>();
  
  urls.forEach(url => {
    const normalized = normalizeRelayUrl(url);
    if (normalized) {
      set.add(normalized);
    }
  });
  
  return set;
}
