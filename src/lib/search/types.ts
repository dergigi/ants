import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { Nip50Extensions } from './searchUtils';

// Streaming search options
export interface StreamingSearchOptions {
  exact?: boolean;
  streaming?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  onResults?: (results: NDKEvent[], isComplete: boolean) => void;
}

// Context passed to search strategies
export interface SearchContext {
  effectiveKinds: number[];
  dateFilter?: { since?: number; until?: number };
  nip50Extensions?: Nip50Extensions;
  chosenRelaySet: NDKRelaySet;
  relaySetOverride?: NDKRelaySet;
  isStreaming: boolean;
  streamingOptions?: StreamingSearchOptions;
  abortSignal?: AbortSignal;
  limit: number;
  extensionFilters?: Array<(content: string) => boolean>;
}

// Extend filter type to include tag queries for "t" (hashtags) and "a" (replaceable events)
export type TagTFilter = NDKFilter & { '#t'?: string[]; '#a'?: string[]; '#license'?: string[] };

