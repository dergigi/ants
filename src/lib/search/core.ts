import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, connectWithTimeout } from '../ndk';
import { searchProfilesFullText, resolveNip05ToPubkey, profileEventFromPubkey, resolveAuthor } from '../vertex';
import { nip19 } from 'nostr-tools';
import { relaySets, RELAYS, getNip50SearchRelaySet } from '../relays';
import { sortEventsNewestFirst, isNpub, getPubkey } from './utils';
import { extractNip50Extensions, buildSearchQueryWithExtensions } from './nip50';
import { stripRelayFilters, extractKindFilter, parseOrQuery, expandParenthesizedOr } from './parsing';
import { subscribeAndStream, subscribeAndCollect, searchByAnyTerms } from './subscription';
import { TagTFilter, StreamingSearchOptions } from './types';

export async function searchEvents(
  query: string,
  limit: number = 200,
  options?: { exact?: boolean } | StreamingSearchOptions,
  relaySetOverride?: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  // Check if already aborted
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Ensure we're connected before issuing any queries (with timeout)
  try {
    await connectWithTimeout(3000);
  } catch (e) {
    console.warn('NDK connect failed or timed out:', e);
    // Continue anyway - search might still work with cached connections
  }

  // Check if aborted after connection
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Check if this is a streaming search
  const isStreaming = options && 'streaming' in options && options.streaming;
  const streamingOptions = isStreaming ? options as StreamingSearchOptions : undefined;

  // Extract NIP-50 extensions first
  const nip50Extraction = extractNip50Extensions(query);
  const nip50Extensions = nip50Extraction.extensions;
  
  // Remove legacy relay filters and choose the default search relay set
  const chosenRelaySet: NDKRelaySet = relaySetOverride
    ? relaySetOverride
    : await getNip50SearchRelaySet();

  // Strip legacy relay filters but keep the rest of the query intact; any replacements
  // are applied earlier at the UI layer via the simple preprocessor.
  const extCleanedQuery = stripRelayFilters(nip50Extraction.cleaned);
  // Extract kind filters and default to [1] when not provided
  const kindExtraction = extractKindFilter(extCleanedQuery);
  const cleanedQuery = kindExtraction.cleaned;
  const effectiveKinds: number[] = (kindExtraction.kinds && kindExtraction.kinds.length > 0)
    ? kindExtraction.kinds
    : [1];
  const extensionFilters: Array<(content: string) => boolean> = [];

  // Distribute parenthesized OR seeds across the entire query BEFORE any specialized handling
  // e.g., "(GM OR GN) by:dergigi" => ["GM by:dergigi", "GN by:dergigi"]
  {
    const expandedSeeds = expandParenthesizedOr(cleanedQuery);
    if (expandedSeeds.length > 1) {
      const merged: NDKEvent[] = [];
      const seen = new Set<string>();
      for (const seed of expandedSeeds) {
        try {
          const partResults = await searchEvents(seed, limit, options, chosenRelaySet, abortSignal);
          for (const evt of partResults) {
            if (!seen.has(evt.id)) { seen.add(evt.id); merged.push(evt); }
          }
        } catch (error) {
          if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
            // no-op
          } else {
            console.warn('Expanded seed failed:', seed, error);
          }
        }
      }
      return merged.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
    }
  }

  // EARLY: Author filter handling (resolve by:<author> to npub and use authors[] filter)
  const earlyAuthorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (earlyAuthorMatch) {
    const [, author] = earlyAuthorMatch;
    const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();
    console.log('Found author filter (early):', { author, terms });

    let pubkey: string | null = null;
    try {
      const resolved = await resolveAuthor(author);
      pubkey = resolved.pubkeyHex;
    } catch {}

    if (!pubkey) {
      console.log('No valid pubkey found for author:', author);
      return [];
    }

    // Expand parenthesized OR seeds inside remaining terms
    const seedExpansions = terms ? expandParenthesizedOr(terms) : [terms];
    const filters: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 200) };
    if (terms && seedExpansions.length === 1) {
      filters.search = buildSearchQueryWithExtensions(terms, nip50Extensions);
    }

    console.log('Searching with filters (early author):', filters);
    let res: NDKEvent[] = [];
    if (terms && seedExpansions.length > 1) {
      // Run each expansion and merge
      const seen = new Set<string>();
      for (const seed of seedExpansions) {
        try {
          const f: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], search: buildSearchQueryWithExtensions(seed, nip50Extensions), limit: Math.max(limit, 200) };
          const r = await subscribeAndCollect(f, 8000, chosenRelaySet, abortSignal);
          for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
        } catch {}
      }
    } else {
      res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
    }
    const seedMatches = Array.from(terms.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
    const seedTerms: string[] = [];
    for (const m of seedMatches) {
      const inner = (m[1] || '').trim();
      if (!inner) continue;
      inner.split(/\s+OR\s+/i).forEach((t) => { const token = t.trim(); if (token) seedTerms.push(token); });
    }
    if (seedTerms.length > 0) {
      try { const seeded = await searchByAnyTerms(seedTerms, limit, chosenRelaySet, abortSignal, nip50Extensions, { authors: [pubkey], kinds: effectiveKinds }); res = [...res, ...seeded]; } catch {}
    }
    const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
    const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
    if (res.length === 0) { res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal); }
    const termStr = terms.trim();
    const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
    if (res.length === 0 && termStr) {
      const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
      const needle = termStr.toLowerCase();
      res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
    } else if (res.length === 0 && hasShortToken) {
      const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
      const needle = termStr.toLowerCase();
      res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
    }
    const dedupe = new Map<string, NDKEvent>();
    for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
    return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
  }

  // Check for top-level OR operator (outside parentheses)
  const orParts = parseOrQuery(cleanedQuery);
  if (orParts.length > 1) {
    console.log('Processing OR query with parts:', orParts);
    const allResults: NDKEvent[] = [];
    const seenIds = new Set<string>();
    
    // Process each part of the OR query
    for (const part of orParts) {
      try {
        const partResults = await searchEvents(part, limit, options, chosenRelaySet, abortSignal);
        for (const event of partResults) {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            allResults.push(event);
          }
        }
      } catch (error) {
        // Suppress abort errors so they don't bubble to UI as console errors
        if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
          // No-op: benign abort during OR processing
        } else {
          console.error(`Error processing OR query part "${part}":`, error);
        }
      }
    }
    
    // Sort by creation time (newest first) and limit results
    const merged = allResults;
    return merged
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  }

  // URL search: always do exact (literal) match for http(s) URLs
  try {
    const url = new URL(cleanedQuery);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const searchQuery = buildSearchQueryWithExtensions(`"${cleanedQuery}"`, nip50Extensions);
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
      const res = results;
      return sortEventsNewestFirst(res).slice(0, limit);
    }
  } catch {}

  // nevent/note bech32: fetch by id (optionally using relays embedded in nevent)
  try {
    const decoded = nip19.decode(extCleanedQuery);
    if (decoded?.type === 'nevent') {
      const data = decoded.data as { id: string; relays?: string[] };
      const neventRelays = Array.isArray(data.relays) ? Array.from(new Set(
        data.relays
          .filter((r: unknown): r is string => typeof r === 'string')
          .map((r) => /^wss?:\/\//i.test(r) ? r : `wss://${r}`)
      )) : [];
      const setsToTry: NDKRelaySet[] = [];
      if (neventRelays.length > 0) {
        setsToTry.push(NDKRelaySet.fromRelayUrls(neventRelays, ndk));
      }
      // Try a broader default set next
      setsToTry.push(NDKRelaySet.fromRelayUrls([...RELAYS.DEFAULT], ndk));
      // Finally try the chosen search set
      setsToTry.push(chosenRelaySet);

      for (const rs of setsToTry) {
        const byId = await subscribeAndCollect({ ids: [data.id], limit: 1 }, 8000, rs, abortSignal);
        if (byId.length > 0) return byId;
      }
      return [];
    }
    if (decoded?.type === 'note') {
      const id = decoded.data as string;
      const setsToTry: NDKRelaySet[] = [
        NDKRelaySet.fromRelayUrls([...RELAYS.DEFAULT], ndk),
        chosenRelaySet
      ];
      for (const rs of setsToTry) {
        const byId = await subscribeAndCollect({ ids: [id], limit: 1 }, 8000, rs, abortSignal);
        if (byId.length > 0) return byId;
      }
      return [];
    }
  } catch {}

  // Pure hashtag search: use tag-based filter across broad relay set (no NIP-50 required)
  const hashtagMatches = cleanedQuery.match(/#[A-Za-z0-9_]+/g) || [];
  const nonHashtagRemainder = cleanedQuery.replace(/#[A-Za-z0-9_]+/g, '').trim();
  if (hashtagMatches.length > 0 && nonHashtagRemainder.length === 0) {
    const tags = Array.from(new Set(hashtagMatches.map((h) => h.slice(1).toLowerCase())));
    const tagFilter: TagTFilter = { kinds: effectiveKinds, '#t': tags, limit: Math.max(limit, 500) };

    // Broader relay set than NIP-50 search: default + search relays
    const broadRelays = Array.from(
      new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH].map((u) => u as string))
    );
    const tagRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);

    const results = isStreaming
      ? await subscribeAndStream(tagFilter, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: tagRelaySet,
          abortSignal
        })
      : await subscribeAndCollect(tagFilter, 10000, tagRelaySet, abortSignal);

    let final = results;
    if (extensionFilters.length > 0) {
      final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
    }
    return final
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  }

  // Full-text profile search `p:<term>` (not only username)
  const fullProfileMatch = cleanedQuery.match(/^p:(.+)$/i);
  if (fullProfileMatch) {
    const term = (fullProfileMatch[1] || '').trim();
    if (!term) return [];
    try {
      const profiles = await searchProfilesFullText(term, 21);
      return profiles;
    } catch (error) {
      console.warn('Full-text profile search failed:', error);
      return [];
    }
  }

  // Check if the query is a direct npub
  if (isNpub(cleanedQuery)) {
    try {
      const pubkey = getPubkey(cleanedQuery);
      if (!pubkey) return [];

      const res = await subscribeAndCollect({
        kinds: effectiveKinds,
        authors: [pubkey],
        limit: Math.max(limit, 200)
      }, 8000, chosenRelaySet, abortSignal);
      return sortEventsNewestFirst(res).slice(0, limit);
    } catch (error) {
      console.error('Error processing npub query:', error);
      return [];
    }
  }

  // NIP-05 resolution: '@name@domain' or 'domain.tld' or '@domain.tld'
  const nip05Like = cleanedQuery.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
  if (nip05Like) {
    try {
      const pubkey = await resolveNip05ToPubkey(cleanedQuery);
      if (pubkey) {
        const profileEvt = await profileEventFromPubkey(pubkey);
        return [profileEvt];
      }
    } catch {}
  }

  // Check for author filter
  const authorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (authorMatch) {
    const [, author] = authorMatch;
    // Extract search terms by removing the author filter
    const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();
    console.log('Found author filter:', { author, terms });

    let pubkey: string | null = null;
    try {
      // Unified resolver handles npub, nip05, and username with a single DVM attempt
      const resolved = await resolveAuthor(author);
      pubkey = resolved.pubkeyHex;
    } catch (error) {
      console.error('Error resolving author:', error);
    }

    if (!pubkey) {
      console.log('No valid pubkey found for author:', author);
      return [];
    }

    const filters: NDKFilter = {
      kinds: effectiveKinds,
      authors: [pubkey],
      limit: Math.max(limit, 200)
    };

    // Add search term to the filter if present
    if (terms) {
      const seedExpansions2 = expandParenthesizedOr(terms);
      if (seedExpansions2.length === 1) {
        filters.search = buildSearchQueryWithExtensions(terms, nip50Extensions);
        filters.limit = Math.max(limit, 200);
      }
    }

    console.log('Searching with filters:', filters);
    {
      // Fetch by base terms if any, restricted to author
      let res: NDKEvent[] = [];
      if (terms) {
        const seedExpansions3 = expandParenthesizedOr(terms);
        if (seedExpansions3.length > 1) {
          const seen = new Set<string>();
          for (const seed of seedExpansions3) {
            try {
              const f: NDKFilter = { kinds: effectiveKinds, authors: [pubkey], search: buildSearchQueryWithExtensions(seed, nip50Extensions), limit: Math.max(limit, 200) };
              const r = await subscribeAndCollect(f, 8000, chosenRelaySet, abortSignal);
              for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
            } catch {}
          }
        } else {
          res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
        }
      } else {
        res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
      }

      // If the remaining terms contain parenthesized OR seeds like (a OR b), run a seeded OR search too
      const seedMatches = Array.from(terms.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
      const seedTerms: string[] = [];
      for (const m of seedMatches) {
        const inner = (m[1] || '').trim();
        if (!inner) continue;
        inner.split(/\s+OR\s+/i).forEach((t) => {
          const token = t.trim();
          if (token) seedTerms.push(token);
        });
      }
      if (seedTerms.length > 0) {
        try {
          const seeded = await searchByAnyTerms(seedTerms, limit, chosenRelaySet, abortSignal, nip50Extensions, { authors: [pubkey], kinds: effectiveKinds });
          res = [...res, ...seeded];
        } catch {}
      }
      // Fallback: if no results, try a broader relay set (default + search)
      const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
      const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
      if (res.length === 0) {
        res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal);
      }
      // Additional fallback for very short terms (e.g., "GM") or stubborn empties:
      // some relays require >=3 chars for NIP-50 search; fetch author-only and filter client-side
      const termStr = terms.trim();
      const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
      if (res.length === 0 && termStr) {
        const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      } else if (res.length === 0 && hasShortToken) {
        const authorOnly = await subscribeAndCollect({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      }
      let mergedResults: NDKEvent[] = res;
      // Dedupe
      const dedupe = new Map<string, NDKEvent>();
      for (const e of mergedResults) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
      mergedResults = Array.from(dedupe.values());
      // Do not enforce additional client-side text match; rely on relay-side search
      const filtered = mergedResults;
      
      return sortEventsNewestFirst(filtered).slice(0, limit);
    }
  }
  
  // Regular search without author filter
  try {
    let results: NDKEvent[] = [];
    const baseSearch = options?.exact ? `"${cleanedQuery}"` : cleanedQuery || undefined;
    const searchQuery = baseSearch ? buildSearchQueryWithExtensions(baseSearch, nip50Extensions) : undefined;
    results = isStreaming 
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
      : await subscribeAndCollect({ kinds: effectiveKinds, search: searchQuery, limit: Math.max(limit, 200) }, 8000, chosenRelaySet, abortSignal);
    console.log('Search results:', {
      query: cleanedQuery,
      resultCount: results.length
    });
    
    // Enforce AND: must match text and contain requested media
    const filtered = results.filter((e, idx, arr) => {
      // dedupe by id while mapping
      const firstIdx = arr.findIndex((x) => x.id === e.id);
      return firstIdx === idx;
    });
    
    return sortEventsNewestFirst(filtered).slice(0, limit);
  } catch (error) {
    // Treat aborted searches as benign; return empty without logging an error
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
      return [];
    }
    console.error('Error fetching events:', error);
    return [];
  }
}

// Convenience function for streaming search
export async function searchEventsStreaming(
  query: string,
  onResults: (results: NDKEvent[], isComplete: boolean) => void,
  options: {
    maxResults?: number;
    timeoutMs?: number;
    exact?: boolean;
    relaySetOverride?: NDKRelaySet;
    abortSignal?: AbortSignal;
  } = {}
): Promise<NDKEvent[]> {
  return searchEvents(query, 1000, {
    streaming: true,
    onResults,
    maxResults: options.maxResults || 1000,
    timeoutMs: options.timeoutMs || 30000,
    exact: options.exact
  }, options.relaySetOverride, options.abortSignal);
}
