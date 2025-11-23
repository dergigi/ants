import { NDKEvent } from '@nostr-dev-kit/ndk';
import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { Nip50Extensions } from '../searchUtils';
import { StreamingSearchOptions } from '../types';

/**
 * Handle URL search queries
 * Returns null if the query is not a URL
 */
export async function tryHandleUrlSearch(
  query: string,
  effectiveKinds: number[],
  nip50Extensions: Nip50Extensions | undefined,
  limit: number,
  isStreaming: boolean,
  streamingOptions: StreamingSearchOptions | undefined,
  chosenRelaySet: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[] | null> {
  try {
    const url = new URL(query);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const { searchUrlEvents } = await import('../urlSearch');
      return await searchUrlEvents(
        query,
        effectiveKinds,
        nip50Extensions || {},
        limit,
        isStreaming,
        streamingOptions,
        chosenRelaySet,
        abortSignal
      );
    }
  } catch {
    // Not a valid URL
  }
  
  return null;
}

