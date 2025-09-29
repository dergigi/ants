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
  const eventsReceivedRelays = Array.from(new Set([
    ...(connectionDetails.connectedRelays || []),
    ...recentlyActive
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
