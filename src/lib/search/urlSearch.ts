import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { 
  Nip50Extensions, 
  sortEventsNewestFirst, 
  buildSearchQueryWithExtensions,
  subscribeAndStream,
  subscribeAndCollect
} from './searchUtils';

// Use the StreamingSearchOptions from the main search module
type StreamingSearchOptions = {
  exact?: boolean;
  streaming?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  onResults?: (results: NDKEvent[], isComplete: boolean) => void;
};

export async function searchUrlEvents(
  cleanedQuery: string,
  effectiveKinds: number[],
  nip50Extensions: Nip50Extensions,
  limit: number,
  isStreaming: boolean,
  streamingOptions: StreamingSearchOptions | undefined,
  chosenRelaySet: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  // Strip protocol and search for the domain and path content
  const urlWithoutProtocol = cleanedQuery.replace(/^https?:\/\//, '');
  const searchQuery = buildSearchQueryWithExtensions(`"${urlWithoutProtocol}"`, nip50Extensions);
  
  const results = isStreaming 
    ? await subscribeAndStream({
        kinds: effectiveKinds,
        search: searchQuery
      }, {
        timeoutMs: streamingOptions?.timeoutMs || 30000,
        maxResults: streamingOptions?.maxResults || 1000,
        onResults: streamingOptions?.onResults,
        relaySet: chosenRelaySet,
        abortSignal
      })
    : await subscribeAndCollect({
        kinds: effectiveKinds,
        search: searchQuery,
        limit: Math.max(limit, 200)
      }, 8000, chosenRelaySet, abortSignal);
  
  return sortEventsNewestFirst(results).slice(0, limit);
}
