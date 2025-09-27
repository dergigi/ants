import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { subscribeAndStream, subscribeAndCollect, Nip50Extensions } from '../search';

// Interface for streaming search options
interface StreamingSearchOptions {
  streaming: boolean;
  timeoutMs?: number;
  maxResults?: number;
  onResults?: (results: NDKEvent[], isComplete: boolean) => void;
}

// Ensure newest-first ordering by created_at
function sortEventsNewestFirst(events: NDKEvent[]): NDKEvent[] {
  return [...events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/**
 * Builds a search query with NIP-50 extensions
 */
function buildSearchQueryWithExtensions(query: string, extensions: Nip50Extensions): string {
  let searchQuery = query;
  
  // Add NIP-50 extensions to the search query
  if (extensions.domain) {
    searchQuery += ` domain:${extensions.domain}`;
  }
  
  if (extensions.language) {
    searchQuery += ` language:${extensions.language}`;
  }
  
  if (extensions.sentiment) {
    searchQuery += ` sentiment:${extensions.sentiment}`;
  }
  
  if (extensions.nsfw === false) {
    searchQuery += ' nsfw:false';
  }
  
  if (extensions.includeSpam) {
    searchQuery += ' include:spam';
  }
  
  return searchQuery;
}

/**
 * Checks if a string is a valid HTTP/HTTPS URL
 */
function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Strips the protocol (http:// or https://) from a URL
 */
function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/**
 * Performs URL search by stripping the protocol and searching for domain/path content
 */
export async function searchUrlEvents(
  url: string,
  kinds: number[],
  nip50Extensions: Nip50Extensions,
  limit: number,
  isStreaming: boolean,
  streamingOptions: StreamingSearchOptions | undefined,
  relaySet: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  // Validate that it's a valid HTTP/HTTPS URL
  if (!isValidHttpUrl(url)) {
    throw new Error('Invalid HTTP/HTTPS URL provided');
  }

  // Strip protocol and search for the domain and path content
  const urlWithoutProtocol = stripProtocol(url);
  const searchQuery = buildSearchQueryWithExtensions(`"${urlWithoutProtocol}"`, nip50Extensions);
  
  const results = isStreaming 
    ? await subscribeAndStream({
        kinds,
        search: searchQuery
      }, {
        timeoutMs: streamingOptions?.timeoutMs || 30000,
        maxResults: streamingOptions?.maxResults || 1000,
        onResults: streamingOptions?.onResults,
        relaySet,
        abortSignal
      })
    : await subscribeAndCollect({
        kinds,
        search: searchQuery,
        limit: Math.max(limit, 200)
      }, 8000, relaySet, abortSignal);
  
  return sortEventsNewestFirst(results).slice(0, limit);
}
