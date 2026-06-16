'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { getCurrentProfileNpub, toImplicitUrlQuery, toExplicitInputFromUrl, ensureAuthorForBackend, decodeUrlQuery } from '@/lib/search/queryTransforms';
import { getProfileScopeIdentifiers, removeProfileScope } from '@/lib/search/profileScope';
import { isHashtagOnlyQuery, hashtagQueryToUrl } from '@/lib/utils';
import { updateSearchQuery } from '@/lib/utils/navigationUtils';
import { isSlashCommand, buildCli } from '@/lib/utils/searchViewUtils';
import { type SearchViewRefs } from '@/hooks/useSearchViewRefs';

/**
 * Builds the URL updater used whenever a search is triggered:
 * keeps the address bar in sync with the current query and path type.
 */
export function useUrlUpdater(options: {
  manageUrl: boolean;
  onUrlUpdate?: (query: string) => void;
  profileScopeUser: NDKUser | null;
}) {
  const { manageUrl, onUrlUpdate, profileScopeUser } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback((searchQuery: string) => {
    // If custom URL update handler is provided, use it instead
    if (onUrlUpdate) {
      onUrlUpdate(searchQuery);
      return;
    }

    if (!manageUrl) return;

    // If query is empty, remove q parameter and navigate to clean URL
    if (!searchQuery.trim()) {
      const currentProfileNpub = getCurrentProfileNpub(pathname);
      if (currentProfileNpub) {
        // On profile pages, just remove the q parameter
        const params = new URLSearchParams(searchParams.toString());
        params.delete('q');
        const newUrl = params.toString() ? `?${params.toString()}` : '';
        router.replace(newUrl);
      } else {
        // On root pages, navigate to clean root
        router.replace('/');
      }
      return;
    }

    // Detect current path type
    const currentProfileNpub = getCurrentProfileNpub(pathname);
    const isOnTagPath = pathname?.startsWith('/t/');
    const isOnEventPath = pathname?.startsWith('/e/');
    const isOnProfilePath = currentProfileNpub !== null;

    // Handle hashtag-only queries
    if (!isOnProfilePath && isHashtagOnlyQuery(searchQuery)) {
      const hashtagUrl = hashtagQueryToUrl(searchQuery);
      if (hashtagUrl) {
        router.replace(`/t/${hashtagUrl}`);
        return;
      }
    }

    // Handle transitions from special paths to root with query
    if ((isOnTagPath || isOnEventPath) && !isHashtagOnlyQuery(searchQuery)) {
      const params = new URLSearchParams();
      params.set('q', searchQuery);
      router.replace(`/?${params.toString()}`);
      return;
    }

    // Handle profile pages
    if (isOnProfilePath) {
      // URL should be implicit on profile pages: strip matching by:npub
      const urlValue = toImplicitUrlQuery(searchQuery, currentProfileNpub);
      const params = new URLSearchParams(searchParams.toString());

      // Check if query is effectively empty after removing profile scope
      const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
      const isOnlyProfileScope = identifiers ? removeProfileScope(searchQuery, identifiers).trim() === '' : false;

      if (urlValue.trim() && !isOnlyProfileScope) {
        params.set('q', urlValue);
        router.replace(`?${params.toString()}`);
      } else {
        // If implicit query is empty or only contains profile scope, remove q parameter
        params.delete('q');
        const newUrl = params.toString() ? `?${params.toString()}` : '';
        router.replace(newUrl);
      }
    } else {
      // Handle root path
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', searchQuery);
      router.replace(`?${params.toString()}`);
    }
  }, [manageUrl, onUrlUpdate, pathname, searchParams, router, profileScopeUser]);
}

/**
 * Syncs the URL `q` parameter to the query state and executes searches
 * when the URL changes (including profile-scoped translations).
 */
export function useUrlSync(options: {
  manageUrl: boolean;
  initialQuery: string;
  refs: SearchViewRefs;
  profileScopeUser: NDKUser | null;
  profileIdentifier: string | undefined;
  setQuery: (q: string) => void;
  handleSearch: (q: string) => void;
  runSlashCommand: (input: string) => string | undefined;
  setTopCommandText: (t: string | null) => void;
  setTopExamples: (e: string[] | null) => void;
  setKindsRules: (r: Array<{ token: string; expansion: string }> | null) => void;
}) {
  const {
    manageUrl, initialQuery, refs, profileScopeUser, profileIdentifier,
    setQuery, handleSearch, runSlashCommand,
    setTopCommandText, setTopExamples, setKindsRules
  } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { initialQueryRef, initialQueryNormalizedRef, initialSearchDoneRef, lastHashQueryRef, lastExecutedQueryRef } = refs;

  useEffect(() => {
    if (!manageUrl) return;
    const urlQueryRaw = searchParams.get('q') || '';
    const decodedQuery = decodeUrlQuery(urlQueryRaw);
    const normalizedQuery = decodedQuery.trim();
    const currentProfileNpub = getCurrentProfileNpub(pathname);

    const executeSearch = (displayValue: string, backendValue: string) => {
      setQuery(displayValue);
      lastExecutedQueryRef.current = displayValue;
      handleSearch(backendValue);
    };

    if (currentProfileNpub) {
      const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
      const displayIdentifier = identifiers?.profileIdentifier || currentProfileNpub;

      if (!normalizedQuery) {
        const normalizedInitial = initialQueryNormalizedRef.current;
        if (normalizedInitial) {
          executeSearch(normalizedInitial, ensureAuthorForBackend(normalizedInitial, currentProfileNpub));
        } else {
          const defaultDisplay = toExplicitInputFromUrl('', currentProfileNpub, displayIdentifier);
          const backendQuery = ensureAuthorForBackend('', currentProfileNpub);
          executeSearch(defaultDisplay, backendQuery);
          updateSearchQuery(searchParams, router, backendQuery);
        }
        return;
      }

      if (lastHashQueryRef.current === normalizedQuery) return;

      if (isSlashCommand(normalizedQuery)) {
        executeSearch(normalizedQuery, normalizedQuery);
        const unknownCmd = runSlashCommand(normalizedQuery);
        if (unknownCmd) {
          setTopCommandText(buildCli(unknownCmd, 'Unknown command'));
          setTopExamples(null);
        }
      } else {
        const displayValue = toExplicitInputFromUrl(normalizedQuery, currentProfileNpub, displayIdentifier);
        executeSearch(displayValue, ensureAuthorForBackend(normalizedQuery, currentProfileNpub));

        const implicit = toImplicitUrlQuery(normalizedQuery, currentProfileNpub);
        if (implicit !== normalizedQuery) {
          updateSearchQuery(searchParams, router, implicit);
        }
      }
      return;
    }

    if (!normalizedQuery) {
      const normalizedInitial = initialQueryNormalizedRef.current;
      if (normalizedInitial) {
        executeSearch(normalizedInitial, normalizedInitial);
      } else if (lastHashQueryRef.current) {
        setQuery('');
        lastHashQueryRef.current = null;
        lastExecutedQueryRef.current = null;
      }
      return;
    }

    if (lastHashQueryRef.current === normalizedQuery) return;

    if (isSlashCommand(normalizedQuery)) {
      executeSearch(normalizedQuery, normalizedQuery);
      const unknownCmd = runSlashCommand(normalizedQuery);
      if (unknownCmd) {
        setTopCommandText(buildCli(unknownCmd, 'Unknown command'));
        setTopExamples(null);
        setKindsRules(null);
      }
      return;
    }

    executeSearch(normalizedQuery, normalizedQuery);
  }, [manageUrl, searchParams, pathname, router, runSlashCommand, handleSearch, profileScopeUser, profileIdentifier, setQuery, setTopCommandText, setTopExamples, setKindsRules, lastHashQueryRef, lastExecutedQueryRef, initialQueryNormalizedRef]);

  // Reset query tracking refs when the initialQuery prop changes
  useEffect(() => {
    if (initialQueryRef.current !== initialQuery) {
      initialQueryRef.current = initialQuery;
      const normalized = initialQuery.trim() || null;
      initialQueryNormalizedRef.current = normalized;
      initialSearchDoneRef.current = false;
      if (manageUrl) {
        lastHashQueryRef.current = null;
        lastExecutedQueryRef.current = null;
      } else {
        lastHashQueryRef.current = normalized;
        lastExecutedQueryRef.current = normalized;
      }
    }
  }, [initialQuery, manageUrl, initialQueryRef, initialQueryNormalizedRef, initialSearchDoneRef, lastHashQueryRef, lastExecutedQueryRef]);
}
