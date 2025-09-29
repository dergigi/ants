import { ConnectionStatus } from './ndk';

/**
 * Calculate relay counts consistently across all components
 * Ensures RelayCollapsed, RelayExpanded, and RelayStatusDisplay show the same numbers
 */
export function calculateRelayCounts(
  connectionDetails: ConnectionStatus | null,
  recentlyActive: string[]
): { eventsReceivedCount: number; totalCount: number } {
  if (!connectionDetails) return { eventsReceivedCount: 0, totalCount: 0 };
  
  // Events received: connected relays + recently active relays (no duplicates)
  // But exclude any that are in connecting or failed states
  const connectingSet = new Set(connectionDetails.connectingRelays || []);
  const failedSet = new Set(connectionDetails.failedRelays || []);
  
  const eventsReceivedRelays = Array.from(new Set([
    ...(connectionDetails.connectedRelays || []),
    ...recentlyActive.filter(relay => !connectingSet.has(relay) && !failedSet.has(relay))
  ]));
  
  // Create a set of all relays that received events to ensure mutual exclusivity
  const eventsReceivedSet = new Set(eventsReceivedRelays);
  
  // Others: connecting + failed relays (excluding those that received events)
  const otherRelays = [
    ...(connectionDetails.connectingRelays || []),
    ...(connectionDetails.failedRelays || [])
  ].filter(relay => !eventsReceivedSet.has(relay));
  
  return {
    eventsReceivedCount: eventsReceivedRelays.length,
    totalCount: eventsReceivedRelays.length + otherRelays.length
  };
}

/**
 * Get the actual relay lists with mutual exclusivity
 * Returns both the relay arrays and counts for consistent display
 */
export function getRelayLists(
  connectionDetails: ConnectionStatus | null,
  recentlyActive: string[]
): { 
  eventsReceivedRelays: string[]; 
  otherRelays: string[]; 
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
  
  // Events received: connected relays + recently active relays (no duplicates)
  // But exclude any that are in connecting or failed states
  const connectingSet = new Set(connectionDetails.connectingRelays || []);
  const failedSet = new Set(connectionDetails.failedRelays || []);
  
  const eventsReceivedRelays = Array.from(new Set([
    ...(connectionDetails.connectedRelays || []),
    ...recentlyActive.filter(relay => !connectingSet.has(relay) && !failedSet.has(relay))
  ]));
  
  // Create a set of all relays that received events to ensure mutual exclusivity
  const eventsReceivedSet = new Set(eventsReceivedRelays);
  
  // Others: connecting + failed relays (excluding those that received events)
  const otherRelays = [
    ...(connectionDetails.connectingRelays || []),
    ...(connectionDetails.failedRelays || [])
  ].filter(relay => !eventsReceivedSet.has(relay));
  
  return {
    eventsReceivedRelays,
    otherRelays,
    eventsReceivedCount: eventsReceivedRelays.length,
    totalCount: eventsReceivedRelays.length + otherRelays.length
  };
}
