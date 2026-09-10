import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { Nip50Extensions } from './searchUtils';

// Options accepted by searchEvents
export interface SearchOptions {
  exact?: boolean;
  // Called with partial results while subscriptions are still collecting
  onPartialResults?: (results: NDKEvent[]) => void;
  // Called when profile search results are re-ranked after NIP-05 verifications land
  onProfileResultsUpdate?: (results: NDKEvent[]) => void;
}

// Context passed to search strategies
export interface SearchContext {
  effectiveKinds: number[];
  dateFilter?: { since?: number; until?: number };
  nip50Extensions?: Nip50Extensions;
  chosenRelaySet: NDKRelaySet;
  relaySetOverride?: NDKRelaySet;
  abortSignal?: AbortSignal;
  limit: number;
  extensionFilters?: Array<(content: string) => boolean>;
  // Shared partial-results emitter (already merged across subscriptions)
  onPartialResults?: (results: NDKEvent[]) => void;
  onProfileResultsUpdate?: (results: NDKEvent[]) => void;
}

// Extend filter type to include tag queries for "t" (hashtags) and "a" (replaceable events)
export type TagTFilter = NDKFilter & { '#t'?: string[]; '#a'?: string[]; '#license'?: string[] };

