/**
 * Event-to-relay tracking system
 * Tracks which relays provided which events without modifying NDKEvent objects
 */

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { normalizeRelayUrl } from './urlUtils';

// Map of event ID to relay sources
const eventRelayMap = new Map<string, string[]>();

/**
 * Track that an event was received from a specific relay
 */
export function trackEventRelay(event: NDKEvent, relayUrl: string): void {
  const eventId = event.id;
  const normalizedUrl = normalizeRelayUrl(relayUrl);
  
  if (!eventRelayMap.has(eventId)) {
    eventRelayMap.set(eventId, []);
  }
  
  const sources = eventRelayMap.get(eventId)!;
  if (!sources.includes(normalizedUrl)) {
    sources.push(normalizedUrl);
  }
}

/**
 * Get all relay sources for an event
 */
export function getEventRelaySources(event: NDKEvent): string[] {
  return eventRelayMap.get(event.id) || [];
}

/**
 * Get the primary relay source for an event (first one)
 */
export function getEventPrimaryRelay(event: NDKEvent): string | null {
  const sources = getEventRelaySources(event);
  return sources.length > 0 ? sources[0] : null;
}

/**
 * Check if an event was received from a specific relay
 */
export function eventFromRelay(event: NDKEvent, relayUrl: string): boolean {
  const sources = getEventRelaySources(event);
  const normalizedUrl = normalizeRelayUrl(relayUrl);
  return sources.includes(normalizedUrl);
}

/**
 * Clear all tracking data (useful for testing or memory management)
 */
export function clearEventRelayTracking(): void {
  eventRelayMap.clear();
}

/**
 * Get all events from a specific relay
 */
export function getEventsFromRelay(events: NDKEvent[], relayUrl: string): NDKEvent[] {
  const normalizedUrl = normalizeRelayUrl(relayUrl);
  return events.filter(event => eventFromRelay(event, normalizedUrl));
}

/**
 * Get statistics about relay contributions
 */
export function getRelayContributions(events: NDKEvent[]): Map<string, number> {
  const contributions = new Map<string, number>();
  
  events.forEach(event => {
    const sources = getEventRelaySources(event);
    sources.forEach(relayUrl => {
      contributions.set(relayUrl, (contributions.get(relayUrl) || 0) + 1);
    });
  });
  
  return contributions;
}
