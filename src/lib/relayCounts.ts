import { ConnectionStatus } from './ndk';
import { RELAYS } from './relays';

// Create a canonical identifier for a relay URL to ensure consistent
// de-duplication across sources (connected, recentlyActive, connecting, failed)
function canonicalRelayId(url: string): string {
  try {
    const withScheme = /^wss?:\/\//i.test(url) ? url : `wss://${url}`;
    const u = new URL(withScheme);
    const hostname = (u.hostname || '').toLowerCase();
    // Normalize path by removing trailing slash(es)
    const path = (u.pathname || '').replace(/\/+$/g, '');
    return `${hostname}${path}`;
  } catch {
    // Fallback: strip scheme, trailing slash, lowercase
    return url.replace(/^wss?:\/\//i, '').replace(/\/+$/g, '').toLowerCase();
  }
}

/**
 * Calculate relay counts consistently across all components
 * Ensures RelayCollapsed, RelayExpanded, and RelayStatusDisplay show the same numbers
 */
export function calculateRelayCounts(
  connectionDetails: ConnectionStatus | null,
  recentlyActive: string[]
): { eventsReceivedCount: number; totalCount: number } {
  if (!connectionDetails) return { eventsReceivedCount: 0, totalCount: 0 };
  
  // Build canonical id sets for each category
  const connected = (connectionDetails.connectedRelays || []).map(r => r.trim());
  const connecting = (connectionDetails.connectingRelays || []).map(r => r.trim());
  const failed = (connectionDetails.failedRelays || []).map(r => r.trim());
  const recent = (recentlyActive || []).map(r => r.trim());

  const connectingIds = new Set(connecting.map(canonicalRelayId));
  const failedIds = new Set(failed.map(canonicalRelayId));

  // Events received: connected OR recently active (but exclude those currently connecting/failed)
  const eventsReceivedIds = new Set<string>();
  connected.forEach(r => eventsReceivedIds.add(canonicalRelayId(r)));
  recent.forEach(r => {
    const id = canonicalRelayId(r);
    if (!connectingIds.has(id) && !failedIds.has(id)) {
      eventsReceivedIds.add(id);
    }
  });

  // Others: connecting + failed, excluding anything already in events received
  const otherIds = new Set<string>();
  connecting.forEach(r => {
    const id = canonicalRelayId(r);
    if (!eventsReceivedIds.has(id)) otherIds.add(id);
  });
  failed.forEach(r => {
    const id = canonicalRelayId(r);
    if (!eventsReceivedIds.has(id)) otherIds.add(id);
  });
  
  return {
    eventsReceivedCount: eventsReceivedIds.size,
    totalCount: eventsReceivedIds.size + otherIds.size
  };
}

const SEARCH_RELAY_IDS = new Set<string>(
  [...RELAYS.SEARCH, ...RELAYS.PROFILE_SEARCH].map((url) => canonicalRelayId(url))
);

/**
 * Get the actual relay lists with mutual exclusivity
 * Returns both the relay arrays and counts for consistent display
 */
export function getRelayLists(
  connectionDetails: ConnectionStatus | null,
  recentlyActive: string[]
): { 
  eventsReceivedRelays: Array<{ url: string; isSearchRelay: boolean }>; 
  otherRelays: Array<{ url: string; isSearchRelay: boolean }>; 
  eventsReceivedCount: number; 
  totalCount: number; 
} {
  if (!connectionDetails) {
    return { 
      eventsReceivedRelays: [], 
      otherRelays: [], 
      eventsReceivedCount: 0, 
      totalCount: 0 
    };
  }
  
  // Prepare normalized/canonical forms and maps to original strings
  const connected = (connectionDetails.connectedRelays || []).map(r => r.trim());
  const connecting = (connectionDetails.connectingRelays || []).map(r => r.trim());
  const failed = (connectionDetails.failedRelays || []).map(r => r.trim());
  const recent = (recentlyActive || []).map(r => r.trim());

  const connectingIds = new Set(connecting.map(canonicalRelayId));
  const failedIds = new Set(failed.map(canonicalRelayId));

  const idToOriginal: Map<string, string> = new Map();
  const storeOriginal = (r: string) => {
    const id = canonicalRelayId(r);
    if (!idToOriginal.has(id)) idToOriginal.set(id, r);
    return id;
  };

  // Events received
  const eventsReceivedIds = new Set<string>();
  connected.forEach(r => eventsReceivedIds.add(storeOriginal(r)));
  recent.forEach(r => {
    const id = storeOriginal(r);
    if (!connectingIds.has(id) && !failedIds.has(id)) {
      eventsReceivedIds.add(id);
    }
  });

  // Others
  const otherIds = new Set<string>();
  connecting.forEach(r => {
    const id = storeOriginal(r);
    if (!eventsReceivedIds.has(id)) otherIds.add(id);
  });
  failed.forEach(r => {
    const id = storeOriginal(r);
    if (!eventsReceivedIds.has(id)) otherIds.add(id);
  });

  const eventsReceivedRelays = Array.from(eventsReceivedIds).map(id => ({
    url: idToOriginal.get(id) || id,
    isSearchRelay: SEARCH_RELAY_IDS.has(id)
  }));
  const otherRelays = Array.from(otherIds).map(id => ({
    url: idToOriginal.get(id) || id,
    isSearchRelay: SEARCH_RELAY_IDS.has(id)
  }));
  
  return {
    eventsReceivedRelays,
    otherRelays,
    eventsReceivedCount: eventsReceivedRelays.length,
    totalCount: eventsReceivedRelays.length + otherRelays.length
  };
}
