import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk } from '../ndk';
import { relaySets as predefinedRelaySets } from '../relays';
import { subscribeAndCollect } from './searchUtils';

/**
 * Check if a string is a valid npub: starts with npub1, contains only valid bech32 characters, and reasonable length
 */
export function isNpub(str: string): boolean {
  return /^npub1[0-9a-z]+$/i.test(str) && str.length > 10;
}

/**
 * Get pubkey from a string (npub or hex)
 */
export function getPubkey(str: string): string | null {
  if (isNpub(str)) {
    try {
      const { data } = nip19.decode(str);
      return data as string;
    } catch (error) {
      console.error('Error decoding npub:', error);
      return null;
    }
  }
  return str;
}

/**
 * Sanitize and normalize relay URLs
 */
export function sanitizeRelayUrls(relays: unknown): string[] {
  if (!Array.isArray(relays)) return [];
  const normalized = relays
    .filter((r: unknown): r is string => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim())
    .map((r) => (/^wss?:\/\//i.test(r) ? r : `wss://${r}`));
  return Array.from(new Set(normalized));
}

/**
 * Fetch event by identifier (id or filter) with optional relay hints
 * @param options - Options containing id, filter, or relayHints
 * @param abortSignal - Optional abort signal
 * @param getSearchRelaySet - Function to get the search relay set (to avoid circular dependency)
 */
export async function fetchEventByIdentifier(
  options: {
    id?: string;
    filter?: NDKFilter;
    relayHints?: string[];
  },
  abortSignal?: AbortSignal,
  getSearchRelaySet?: () => Promise<NDKRelaySet>
): Promise<NDKEvent[]> {
  const { id, filter, relayHints } = options;
  const baseFilter = filter || (id ? { ids: [id], limit: 1 } : undefined);
  if (!baseFilter) return [];

  const relaySetsToTry: NDKRelaySet[] = [];
  const hinted = sanitizeRelayUrls(relayHints);
  if (hinted.length > 0) {
    relaySetsToTry.push(NDKRelaySet.fromRelayUrls(hinted, ndk));
  }
  relaySetsToTry.push(await predefinedRelaySets.default());
  if (getSearchRelaySet) {
    relaySetsToTry.push(await getSearchRelaySet());
  }

  for (const rs of relaySetsToTry) {
    const events = await subscribeAndCollect(baseFilter as NDKFilter, 8000, rs, abortSignal);
    if (events.length > 0) return events;
  }
  return [];
}

/**
 * Search for events by NIP-19 identifier (nevent, note, or naddr)
 * Returns empty array if the query is not a valid NIP-19 identifier
 */
export async function searchByNip19Identifier(
  cleanedQuery: string,
  abortSignal?: AbortSignal,
  getSearchRelaySet?: () => Promise<NDKRelaySet>
): Promise<NDKEvent[]> {
  try {
    const decoded = nip19.decode(cleanedQuery);
    if (decoded?.type === 'nevent') {
      const data = decoded.data as { id: string; relays?: string[] };
      const results = await fetchEventByIdentifier({ id: data.id, relayHints: data.relays }, abortSignal, getSearchRelaySet);
      if (results.length > 0) return results;
      return [];
    }
    if (decoded?.type === 'note') {
      const id = decoded.data as string;
      const results = await fetchEventByIdentifier({ id }, abortSignal, getSearchRelaySet);
      if (results.length > 0) return results;
      return [];
    }
    if (decoded?.type === 'naddr') {
      const data = decoded.data as { pubkey: string; identifier: string; kind: number; relays?: string[] };
      const pointerFilter: NDKFilter = {
        kinds: [data.kind],
        authors: [data.pubkey],
        '#d': [data.identifier],
        limit: 1
      };
      const results = await fetchEventByIdentifier({ filter: pointerFilter, relayHints: data.relays }, abortSignal, getSearchRelaySet);
      if (results.length > 0) return results;
      return [];
    }
  } catch {
    // Not a valid NIP-19 identifier, return empty array to allow fallthrough
  }
  return [];
}

