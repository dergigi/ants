'use client';

import { useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { NDKEvent, NDKRelaySet, NDKUser } from '@nostr-dev-kit/ndk';
import { connect, ConnectionStatus } from '@/lib/ndk';
import { searchEvents } from '@/lib/search';
import { extractRelaySourcesFromEvent, createRelaySet } from '@/lib/urlUtils';
import { extractNip19Identifiers, decodeNip19Identifier } from '@/lib/utils/nostrIdentifiers';
import { getCurrentProfileNpub, toImplicitUrlQuery, ensureAuthorForBackend } from '@/lib/search/queryTransforms';
import { extractScopedAuthorTokens, isNpubAuthorToken, resolveScopedAuthorTokens } from '@/lib/search/queryPreprocessing';
import { getProfileScopeIdentifiers, hasProfileScope } from '@/lib/search/profileScope';
import { relaySets, getNip50SearchRelaySet } from '@/lib/relays';
import { prewarmSearchRuntime } from '@/lib/search/prewarm';
import { isSlashCommand, isUrlQuery, buildCli } from '@/lib/utils/searchViewUtils';
import { type SearchViewRefs } from '@/hooks/useSearchViewRefs';

type SearchExecutionOptions = {
  query: string;
  initialQuery: string;
  manageUrl: boolean;
  refs: SearchViewRefs;
  loading: boolean;
  setQuery: (q: string) => void;
  setResults: Dispatch<SetStateAction<NDKEvent[]>>;
  setLoading: (l: boolean) => void;
  setResolvingAuthor: (r: boolean) => void;
  setShowExternalButton: (s: boolean) => void;
  setSuccessfullyActiveRelays: (relays: Set<string>) => void;
  setToggledRelays: (relays: Set<string>) => void;
  setTopCommandText: (t: string | null) => void;
  setTopExamples: (e: string[] | null) => void;
  setKindsRules: (r: Array<{ token: string; expansion: string }> | null) => void;
  setIsConnecting: (c: boolean) => void;
  setConnectionDetails: (d: ConnectionStatus | null) => void;
  triggerLogin: () => void;
  runSlashCommand: (input: string) => string | undefined;
  updateUrlForSearch: (q: string) => void;
  profileScopeUser: NDKUser | null;
};

/**
 * The search lifecycle: NDK bootstrap, identifier redirects, author
 * resolution, relay set choice, abort handling, and result delivery.
 */
export function useSearchExecution(options: SearchExecutionOptions) {
  const {
    query, initialQuery, manageUrl, refs, loading,
    setQuery, setResults, setLoading, setResolvingAuthor, setShowExternalButton,
    setSuccessfullyActiveRelays, setToggledRelays,
    setTopCommandText, setTopExamples, setKindsRules,
    setIsConnecting, setConnectionDetails,
    triggerLogin, runSlashCommand, updateUrlForSearch, profileScopeUser
  } = options;
  const router = useRouter();
  const pathname = usePathname();
  const { currentSearchId, abortControllerRef, suppressSearchRef, lastIdentifierRedirectRef, initialSearchDoneRef, initialQueryNormalizedRef, initialQueryRef, lastHashQueryRef, lastExecutedQueryRef } = refs;

  // Helper to determine if current query is a direct identifier query
  const isDirectQuery = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return false;
    const nip19Identifiers = extractNip19Identifiers(trimmedQuery);
    if (nip19Identifiers.length === 0) return false;

    const identifierToken = nip19Identifiers[0].trim();
    const firstIdentifier = decodeNip19Identifier(identifierToken.toLowerCase());

    if (!firstIdentifier) return false;

    // Check if the query is just the identifier (direct query)
    const normalizedInput = trimmedQuery
      .replace(/^web\+nostr:/i, '')
      .replace(/^nostr:/i, '')
      .replace(/[\s),.;]*$/, '')
      .trim()
      .toLowerCase();

    const identifierOnly = normalizedInput === identifierToken.toLowerCase();
    if (identifierOnly) return true;

    if (pathname?.startsWith('/e/')) {
      const segment = pathname.split('/')[2]?.trim().toLowerCase();
      if (segment && segment === identifierToken.toLowerCase()) {
        return !/\b(AND|OR|NOT)\b/i.test(trimmedQuery.replace(identifierToken, ''));
      }
    }
    return false;
  }, [query, pathname]);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (suppressSearchRef.current) {
      // Clear the flag and ignore this invocation
      suppressSearchRef.current = false;
      return;
    }
    if (!searchQuery.trim()) {
      setResults([]);
      setResolvingAuthor(false);
      return;
    }

    // Update URL immediately when search is triggered
    const normalizedInput = searchQuery.trim();
    const nip19Identifiers = extractNip19Identifiers(normalizedInput);
    const identifierToken = nip19Identifiers.length > 0 ? nip19Identifiers[0].trim() : null;
    const identifierLower = identifierToken ? identifierToken.toLowerCase() : null;
    const firstIdentifier = identifierLower ? decodeNip19Identifier(identifierLower) : null;

    if (identifierLower && identifierLower === lastIdentifierRedirectRef.current) {
      lastIdentifierRedirectRef.current = null;
    } else if (identifierLower && firstIdentifier) {
      const stripped = normalizedInput
        .replace(/^web\+nostr:/i, '')
        .replace(/^nostr:/i, '')
        .replace(/[\s),.;]*$/, '')
        .trim()
        .toLowerCase();
      const identifierOnly = stripped === identifierLower;
      const identifierInUrl =
        !identifierOnly && isUrlQuery(normalizedInput) && normalizedInput.toLowerCase().includes(identifierLower);

      if (identifierOnly || identifierInUrl) {
        setTopCommandText(null);
        setTopExamples(null);
        setKindsRules(null);
        setShowExternalButton(false);
        setResults([]);
        setLoading(false);
        setResolvingAuthor(false);

        if (firstIdentifier.type === 'nevent' || firstIdentifier.type === 'note' || firstIdentifier.type === 'naddr') {
          // Only redirect if we're not already on the /e/[id] page
          if (!pathname?.startsWith('/e/')) {
            lastIdentifierRedirectRef.current = identifierLower;
            router.push(`/e/${identifierLower}`);
            return;
          }
          // If we're already on the /e/[id] page, continue with the search instead of redirecting
        }
        if (firstIdentifier.type === 'nprofile' || firstIdentifier.type === 'npub') {
          lastIdentifierRedirectRef.current = identifierLower;
          router.push(`/p/${identifierLower}`);
          return;
        }
      }
    }

    // Mark this URL state as already handled so URL sync does not immediately re-run the same search.
    // On profile pages, compare against the implicit URL form without the matching by:<current profile> token.
    const currentProfileNpubForUrl = getCurrentProfileNpub(pathname);
    lastHashQueryRef.current = currentProfileNpubForUrl
      ? toImplicitUrlQuery(searchQuery, currentProfileNpubForUrl)
      : searchQuery.trim();

    // Always update URL to reflect the current search
    updateUrlForSearch(searchQuery);

    // Abort any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this search
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const searchId = ++currentSearchId.current;

    // Clear previous UI immediately
    const isCmd = isSlashCommand(searchQuery);
    if (!isCmd) {
      setTopCommandText(null);
      setTopExamples(null);
      setKindsRules(null);
      setShowExternalButton(false);
    }
    setResults([]);
    setLoading(true);

    // Ensure loading animation is visible for direct lookups
    const isDirectLookup = !manageUrl && initialQuery === searchQuery;
    const minLoadingTime = isDirectLookup ? 800 : 0;

    const authorTokens = extractScopedAuthorTokens(searchQuery);
    const needsAuthorResolution = authorTokens.some(({ core }) => !isNpubAuthorToken(core));

    if (needsAuthorResolution) {
      setResolvingAuthor(true);
    }

    try {
      // Check if search was aborted before making the call
      if (abortController.signal.aborted || currentSearchId.current !== searchId) {
        return;
      }

      let effectiveQuery = searchQuery;
      if (authorTokens.length > 0) {
        const resolvedAuthors = await resolveScopedAuthorTokens(searchQuery, { onMissingMe: 'flag' });
        if (resolvedAuthors.needsLoginForAtMe) {
          triggerLogin();
          setLoading(false);
          setResolvingAuthor(false);
          return;
        }

        effectiveQuery = resolvedAuthors.query;

        const onProfilePage = /^\/p\//i.test(pathname || '');
        const currentProfileNpub = getCurrentProfileNpub(pathname);
        const uniqueByAuthors = Array.from(new Set(
          resolvedAuthors.byAuthors
            .filter((author) => isNpubAuthorToken(author))
            .map((author) => author.toLowerCase())
        ));

        if (onProfilePage && currentProfileNpub && uniqueByAuthors.length === 1 && currentProfileNpub.toLowerCase() !== uniqueByAuthors[0]) {
          const targetProfileNpub = uniqueByAuthors[0];
          const implicitQ = toImplicitUrlQuery(effectiveQuery, targetProfileNpub);
          const carry = encodeURIComponent(implicitQ);
          router.push(`/p/${targetProfileNpub}?q=${carry}`);
          setResolvingAuthor(false);
          setLoading(false);
          return;
        }
      }

      if (needsAuthorResolution) {
        setResolvingAuthor(false);
      }

      const expanded = effectiveQuery;
      const currentProfileNpub = getCurrentProfileNpub(pathname);
      const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
      const shouldScope = identifiers ? hasProfileScope(expanded, identifiers) : false;
      const scopedQuery = shouldScope ? ensureAuthorForBackend(expanded, currentProfileNpub) : expanded;
      lastExecutedQueryRef.current = scopedQuery;

      // Choose relay set based on query type
      let relaySet: NDKRelaySet | undefined;
      if (isDirectQuery) {
        // Direct queries (NIP-19): use all relays
        relaySet = await relaySets.default();
      } else {
        // Search queries (NIP-50): use NIP-50 capable relays only
        relaySet = await getNip50SearchRelaySet();
      }

      // Render results as they arrive; the awaited final result overwrites them
      let searchSettled = false;
      const applyPartialResults = (updated: NDKEvent[]) => {
        if (abortController.signal.aborted || currentSearchId.current !== searchId) return;
        setResults(updated);
      };

      const searchResults = await searchEvents(scopedQuery, 200, {
        // Ignore throttled partials that flush after the final result landed
        onPartialResults: (updated) => {
          if (searchSettled) return;
          applyPartialResults(updated);
        },
        // Re-sort displayed profiles when NIP-05 verifications land after the initial render
        onProfileResultsUpdate: applyPartialResults
      }, relaySet, abortController.signal);
      searchSettled = true;

      // Check if search was aborted after getting results
      if (abortController.signal.aborted || currentSearchId.current !== searchId) {
        return;
      }

      // Rely solely on replacements.txt expansion upstream; no client-side media seeding
      const filtered = searchResults;
      setResults(filtered);

      // Track relays that returned events for this search
      const relayUrls: string[] = [];

      searchResults.forEach(evt => {
        const relaySources = extractRelaySourcesFromEvent(evt);
        relayUrls.push(...relaySources);
      });

      const relays = createRelaySet(relayUrls);
      setSuccessfullyActiveRelays(relays);

      // Initialize toggled relays to include all relays that provided results
      setToggledRelays(relays);

      // Check if this was a URL query and if we got 0 results
      setShowExternalButton(isUrlQuery(searchQuery) && filtered.length === 0);
    } catch (error) {
      // Don't log aborted searches as errors
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
        return;
      }
      console.error('Search error:', error);
      setResults([]);
    } finally {
      // Only update loading state if this is still the current search
      if (currentSearchId.current === searchId) {
        // Ensure minimum loading time for direct lookups to show animation
        if (minLoadingTime > 0) {
          setTimeout(() => {
            if (currentSearchId.current === searchId) {
              setLoading(false);
              setResolvingAuthor(false);
            }
          }, minLoadingTime);
        } else {
          setLoading(false);
          setResolvingAuthor(false);
        }
      }
    }
  }, [pathname, router, updateUrlForSearch, profileScopeUser, initialQuery, manageUrl, isDirectQuery, triggerLogin, suppressSearchRef, abortControllerRef, currentSearchId, lastIdentifierRedirectRef, lastHashQueryRef, lastExecutedQueryRef, setResults, setLoading, setResolvingAuthor, setShowExternalButton, setSuccessfullyActiveRelays, setToggledRelays, setTopCommandText, setTopExamples, setKindsRules]);

  // DRY helper function for root searches (always navigate to root path)
  const setQueryAndNavigateToRoot = useCallback((query: string) => {
    setQuery(query);
    if (query.trim()) {
      router.replace(`/?q=${encodeURIComponent(query)}`);
    } else {
      router.replace('/');
    }
  }, [router, setQuery]);

  // DRY helper for content-based search triggers (always root searches)
  const handleContentSearch = useCallback((query: string) => {
    setQueryAndNavigateToRoot(query);
    // Trigger search immediately for clicked examples
    if (query.trim()) {
      handleSearch(query);
    }
  }, [setQueryAndNavigateToRoot, handleSearch]);

  // Prewarm search, connect NDK on mount, and run the initial query for direct lookups
  useEffect(() => {
    prewarmSearchRuntime();
    const initializeNDK = async () => {
      setIsConnecting(true);
      const connectionResult = await connect(8000); // 8 second timeout for more reliable initial connect
      setIsConnecting(false);
      setConnectionDetails(connectionResult);

      if (!connectionResult.success) {
        console.warn('NDK connection timed out, but search will still work with available relays');
      }

      if (initialQueryRef.current && !manageUrl) {
        const normalizedInitial = initialQueryRef.current.trim();
        if (normalizedInitial && !initialSearchDoneRef.current) {
          initialSearchDoneRef.current = true;
          initialQueryNormalizedRef.current = normalizedInitial;
          lastHashQueryRef.current = normalizedInitial;
          setQuery(initialQueryRef.current);
          if (isSlashCommand(initialQueryRef.current)) {
            const unknownCmd = runSlashCommand(initialQueryRef.current);
            if (unknownCmd) {
              setTopCommandText(buildCli(unknownCmd, 'Unknown command'));
              setTopExamples(null);
              setKindsRules(null);
            }
            handleSearch(initialQueryRef.current);
          } else {
            handleSearch(normalizedInitial);
          }
        }
      }
    };
    initializeNDK();
  }, [handleSearch, manageUrl, runSlashCommand, setConnectionDetails, setIsConnecting, setTopCommandText, setTopExamples, setKindsRules, setQuery, initialQueryRef, initialSearchDoneRef, initialQueryNormalizedRef, lastHashQueryRef]);

  // Handle Escape key to stop current search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && loading) {
        // Abort any ongoing search
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        currentSearchId.current++;
        setLoading(false);
        setResolvingAuthor(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, abortControllerRef, currentSearchId, setLoading, setResolvingAuthor]);

  return { isDirectQuery, handleSearch, handleContentSearch };
}
