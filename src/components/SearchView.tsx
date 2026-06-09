'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { connect, nextExample } from '@/lib/ndk';
import { useRelayStatus } from '@/hooks/useRelayStatus';
import { useSearchUi } from '@/hooks/useSearchUi';
import { useProfileScope } from '@/hooks/useProfileScope';
import { useResultPipeline } from '@/hooks/useResultPipeline';
import { useContentRenderer } from '@/hooks/useContentRenderer';
import { createSlashCommandRunner, executeClearCommand, type SlashCommand } from '@/lib/slashCommands';
import { getIsKindRules } from '@/lib/search/replacements';
import { resolveAuthorToNpub } from '@/lib/vertex';
import { NDKEvent, NDKUser, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { searchEvents } from '@/lib/search';
import { extractRelaySourcesFromEvent, createRelaySet } from '@/lib/urlUtils';
import { updateSearchQuery } from '@/lib/utils/navigationUtils';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getCurrentProfileNpub, toImplicitUrlQuery, toExplicitInputFromUrl, ensureAuthorForBackend, decodeUrlQuery } from '@/lib/search/queryTransforms';
import { getProfileScopeIdentifiers, hasProfileScope, addProfileScope, removeProfileScope } from '@/lib/search/profileScope';
import ClientFilters from '@/components/ClientFilters';
import ProfileScopeIndicator from '@/components/ProfileScopeIndicator';
import FilterCollapsed from '@/components/FilterCollapsed';
import RelayCollapsed from '@/components/RelayCollapsed';
import RelayStatusDisplay from '@/components/RelayStatusDisplay';
import SortCollapsed from '@/components/SortCollapsed';
import ShareButton from '@/components/ShareButton';
import SearchInput from '@/components/SearchInput';
import QueryTranslation from '@/components/QueryTranslation';
import SearchResultsList from '@/components/SearchResultsList';
import { nip19 } from 'nostr-tools';
import { extractNip19Identifiers, decodeNip19Identifier } from '@/lib/utils/nostrIdentifiers';
import { isHashtagOnlyQuery, hashtagQueryToUrl } from '@/lib/utils';
import { relaySets, getNip50SearchRelaySet } from '@/lib/relays';
import { isSlashCommand, isUrlQuery, buildCli } from '@/lib/utils/searchViewUtils';
import { SEARCH_FILTER_THRESHOLD } from '@/lib/constants';
import { getFilteredExamples } from '@/lib/examples';
import { isLoggedIn, login, logout, getStoredPubkey } from '@/lib/nip07';
import { useLoginTrigger } from '@/lib/LoginTrigger';
import { PlaceholderStyles } from './Placeholder';

type Props = {
  initialQuery?: string;
  manageUrl?: boolean;
  onUrlUpdate?: (query: string) => void;
};



// (Local AuthorBadge removed; using global `components/AuthorBadge` inside EventCard.)

export default function SearchView({ initialQuery = '', manageUrl = true, onUrlUpdate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(Boolean(initialQuery && !manageUrl));
  const [resolvingAuthor, setResolvingAuthor] = useState(false);
  const currentSearchId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Suppress accidental searches caused by programmatic query edits (e.g., toggle)
  const suppressSearchRef = useRef(false);
  const lastIdentifierRedirectRef = useRef<string | null>(null);
  const initialSearchDoneRef = useRef(false);
  const normalizedInitialQuery = initialQuery.trim() || null;
  const bootstrapInitial = !manageUrl ? normalizedInitialQuery : null;
  const initialQueryNormalizedRef = useRef<string | null>(normalizedInitialQuery);
  const initialQueryRef = useRef(initialQuery);
  const lastHashQueryRef = useRef<string | null>(bootstrapInitial);
  const lastExecutedQueryRef = useRef<string | null>(bootstrapInitial);
  const [showFilterDetails, setShowFilterDetails] = useState(false);
  const {
    isConnecting,
    setIsConnecting,
    connectionDetails,
    setConnectionDetails,
    showConnectionDetails,
    setShowConnectionDetails,
    relayInfo
  } = useRelayStatus(results.length);
  const [showExternalButton, setShowExternalButton] = useState(false);
  const {
    filterSettings,
    setFilterSettings,
    sortOrder,
    setSortOrder,
    successfullyActiveRelays,
    setSuccessfullyActiveRelays,
    toggledRelays,
    setToggledRelays,
    toggleRelay,
    emojiAutoDisabled,
    fuseFilteredResults,
    sortedResults,
    hasNonProfileResults
  } = useResultPipeline({ results, setResults, query });

  const [topCommandText, setTopCommandText] = useState<string | null>(null);
  const [topExamples, setTopExamples] = useState<string[] | null>(null);
  const [helpCommands, setHelpCommands] = useState<readonly SlashCommand[] | null>(null);
  const [kindsRules, setKindsRules] = useState<Array<{ token: string; expansion: string }> | null>(null);
  const [kindsLoading, setKindsLoading] = useState(false);
  const [kindsError, setKindsError] = useState<string | null>(null);
  const { triggerLogin, onLoginTrigger, setLoginState, setCurrentUser } = useLoginTrigger();

  const handleClear = useCallback(() => {
    // Abort any ongoing search immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    currentSearchId.current++;
    setQuery('');
    setResults([]);
    setLoading(false);
    setResolvingAuthor(false);
    setTopCommandText(null);
    setTopExamples(null);
    setKindsRules(null);
    // Always reset to root path when clearing
    router.replace('/');
  }, [router]);

  const {
    placeholder,
    setPlaceholder,
    rotationProgress,
    searchInputRef,
    handleInputChange,
    handleExampleNext
  } = useSearchUi({ query, loading, setQuery, suppressSearchRef, onClear: handleClear });

  
  // Handle opening external URL
  const handleOpenExternal = useCallback(() => {
    if (query.trim()) {
      window.open(query.trim(), '_blank', 'noopener,noreferrer');
      // Immediately transform back to regular search button
      setShowExternalButton(false);
    }
  }, [query]);
  
  const runSlashCommand = useMemo(() => createSlashCommandRunner({
    onHelp: (commands) => {
      const lines = [
        'Available commands:',
        ...commands.map(c => `  ${c.label.padEnd(12)} ${c.description}`)
      ];
      setTopCommandText(buildCli('--help', lines));
      setHelpCommands(commands);
      setTopExamples(null);
      setKindsRules(null);
    },
    onExamples: () => {
      const examples = getFilteredExamples(isLoggedIn());
      setTopExamples(Array.from(examples));
      setTopCommandText(buildCli('--help examples'));
      setHelpCommands(null);
      setKindsRules(null);
    },
    onLogin: async () => {
      setLoginState('logging-in');
      setTopCommandText(buildCli('login', 'Attempting login…'));
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
      try {
        const user = await login();
        if (user) {
          // Immediately set current user and logged-in state for instant header update
          setCurrentUser(user);
          setLoginState('logged-in');
          const userDisplay = user.profile?.nip05 || user.profile?.displayName || user.profile?.name || user.npub;
          setTopCommandText(buildCli('login', `Logged in as ${userDisplay}`));
          setPlaceholder(nextExample());

          // Fetch profile in the background to avoid blocking header update
          (async () => {
            try {
              await user.fetchProfile();
              // Clone user to ensure state change triggers re-render with updated profile
              const cloned = new NDKUser({ pubkey: user.pubkey });
              cloned.ndk = user.ndk;
              if (user.profile) {
                cloned.profile = { ...(user.profile as Record<string, unknown>) } as typeof user.profile;
              }
              setCurrentUser(cloned);
              // Update login message with fetched profile info
              const updatedDisplay = cloned.profile?.nip05 || cloned.profile?.displayName || cloned.profile?.name || cloned.npub;
              setTopCommandText(buildCli('login', `Logged in as ${updatedDisplay}`));
            } catch {}
          })();
        } else {
          setCurrentUser(null);
          setLoginState('logged-out');
          setTopCommandText(buildCli('login', 'Login cancelled'));
        }
      } catch {
        setCurrentUser(null);
        setLoginState('logged-out');
        setTopCommandText(buildCli('login', 'Login failed. Ensure a NIP-07 extension is installed.'));
      }
    },
    onLogout: () => {
      try {
        logout();
        setCurrentUser(null);
        setLoginState('logged-out');
        setTopCommandText(buildCli('logout', 'Logged out'));
        setPlaceholder(nextExample());
      } catch {
        setTopCommandText(buildCli('logout', 'Logout failed'));
      }
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
    },
    onClear: async () => {
      setTopCommandText(buildCli('clear --cache', 'Clearing all caches...'));
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
      try {
        await executeClearCommand();
        setTopCommandText(buildCli('clear --cache', 'All caches cleared successfully'));
      } catch (error) {
        setTopCommandText(buildCli('clear --cache', `Cache clearing failed: ${error}`));
      }
    },
    onTutorial: () => {
      const tutorialNevent = 'nevent1qqsqnndhkz4u26m4v4gut2xjsun8hzfxn75spzcr8337a06g66zwzespzamhxue69uhksctkv4hzuer9wfnkjemf9e3k7mgehz685';
      setTopCommandText(buildCli('--help tutorial', 'Loading tutorial event...'));
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
      setQuery(tutorialNevent);
      updateSearchQuery(searchParams, router, tutorialNevent);
    },
    onKinds: async () => {
      setTopCommandText(buildCli('kinds', 'Loading kind shortcuts...'));
      setTopExamples(null);
      setHelpCommands(null);
      setResults([]);
      setKindsLoading(true);
      setKindsError(null);
      try {
        const rules = await getIsKindRules();
        setKindsRules(rules.map(r => ({ token: r.token, expansion: r.expansion })));
        setTopCommandText(buildCli('kinds', `${rules.length} is: shortcuts that map to nostr kinds`));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to load kind shortcuts';
        setKindsError(errorMsg);
        setTopCommandText(buildCli('kinds', `Error: ${errorMsg}`));
      } finally {
        setKindsLoading(false);
      }
    }
  }), [setTopCommandText, setPlaceholder, setTopExamples, setLoginState, setCurrentUser, setQuery, searchParams, router]);

  const { profileScopeUser, profileScopeIdentifiers, profileScoped } = useProfileScope({ manageUrl, pathname, query });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function applyClientFilters(events: NDKEvent[], _terms: string[], _active: Set<string>): NDKEvent[] {
    // Rely solely on replacements.txt expansion upstream; no client-side media seeding
    return events;
  }

  // Helper function to update URL immediately when search is triggered
  const updateUrlForSearch = useCallback((searchQuery: string) => {
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
    
    // debug removed
    
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


  // DRY helper function for root searches (always navigate to root path)
  const setQueryAndNavigateToRoot = useCallback((query: string) => {
    setQuery(query);
    if (query.trim()) {
      router.replace(`/?q=${encodeURIComponent(query)}`);
    } else {
      router.replace('/');
    }
  }, [router]);



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
    
    // Expand by:@me / mentions:@me to the logged-in user's npub
    const atMePattern = /(?:^|\s)(?:by|mentions):@me\b/i;
    if (atMePattern.test(searchQuery)) {
      const storedPubkey = getStoredPubkey();
      if (storedPubkey) {
        const myNpub = nip19.npubEncode(storedPubkey);
        searchQuery = searchQuery.replace(/((?:by|mentions):)@me\b/gi, `$1${myNpub}`);
      } else {
        triggerLogin();
        setLoading(false);
        setResolvingAuthor(false);
        return;
      }
    }

    // Check if we need to resolve an author first
    const byMatch = searchQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
    const mentionsMatch = searchQuery.match(/(?:^|\s)mentions:(\S+)(?:\s|$)/i);
    const needsAuthorResolution = (byMatch && !/^npub1[0-9a-z]+$/i.test(byMatch[1]))
      || (mentionsMatch && !/^npub1[0-9a-z]+$/i.test(mentionsMatch[1]));
    
    if (needsAuthorResolution) {
      setResolvingAuthor(true);
    }
    
    try {

      // Check if search was aborted before making the call
      if (abortController.signal.aborted || currentSearchId.current !== searchId) {
        return;
      }

      // Pre-resolve by:<author> to npub (if needed) BEFORE searching
      let effectiveQuery = searchQuery;
      if (needsAuthorResolution && byMatch) {
        const author = (byMatch[1] || '').trim();
        let resolvedNpub: string | null = null;
        try {
          const TIMEOUT_MS = 2500;
          const timed = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
          resolvedNpub = (await Promise.race([resolveAuthorToNpub(author), timed])) as string | null;
        } catch {}
        // If we resolved successfully, replace only the matched by: token with the resolved npub.
        // If resolution failed, proceed without modifying the query; the backend search will fallback.
        if (resolvedNpub) {
          // Replace by: token with resolved npub
          effectiveQuery = effectiveQuery.replace(/(^|\s)by:(\S+)(?=\s|$)/i, (m, pre) => `${pre}by:${resolvedNpub}`);

          // If currently on a profile page and the resolved author differs, navigate there and carry query
          const onProfilePage = /^\/p\//i.test(pathname || '');
          const currentProfileMatch = (pathname || '').match(/^\/p\/(npub1[0-9a-z]+)/i);
          const currentProfileNpub = currentProfileMatch ? currentProfileMatch[1] : null;
          if (onProfilePage && currentProfileNpub && currentProfileNpub.toLowerCase() !== resolvedNpub.toLowerCase()) {
            const implicitQ = toImplicitUrlQuery(effectiveQuery, resolvedNpub);
            const carry = encodeURIComponent(implicitQ);
            router.push(`/p/${resolvedNpub}?q=${carry}`);
            setResolvingAuthor(false);
            setLoading(false);
            return;
          }
        }
        // Resolution phase complete (either way)
        setResolvingAuthor(false);
      }

      if (mentionsMatch && !/^npub1[0-9a-z]+$/i.test(mentionsMatch[1])) {
        const author = (mentionsMatch[1] || '').trim();
        let resolvedNpub: string | null = null;
        try {
          const TIMEOUT_MS = 2500;
          const timed = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
          resolvedNpub = (await Promise.race([resolveAuthorToNpub(author), timed])) as string | null;
        } catch {}
        if (resolvedNpub) {
          effectiveQuery = effectiveQuery.replace(/(^|\s)mentions:(\S+)(?=\s|$)/i, (m, pre) => `${pre}mentions:${resolvedNpub}`);
        }
        setResolvingAuthor(false);
      }

      const expanded = effectiveQuery;
      const currentProfileNpub = getCurrentProfileNpub(pathname);
      const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
      const shouldScope = identifiers ? hasProfileScope(expanded, identifiers) : false;
      const scopedQuery = shouldScope ? ensureAuthorForBackend(expanded, currentProfileNpub) : expanded;

      // Choose relay set based on query type
      let relaySet: NDKRelaySet | undefined;
      if (isDirectQuery) {
        // Direct queries (NIP-19): use all relays
        relaySet = await relaySets.default();
      } else {
        // Search queries (NIP-50): use NIP-50 capable relays only
        relaySet = await getNip50SearchRelaySet();
      }

      const searchResults = await searchEvents(scopedQuery, 200, undefined, relaySet, abortController.signal);
      
      // Check if search was aborted after getting results
      if (abortController.signal.aborted || currentSearchId.current !== searchId) {
        return;
      }

      const filtered = applyClientFilters(searchResults, [], new Set<string>());
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
  }, [pathname, router, updateUrlForSearch, profileScopeUser, initialQuery, manageUrl, isDirectQuery, triggerLogin, setSuccessfullyActiveRelays, setToggledRelays]);

  // DRY helper for content-based search triggers (always root searches)
  const handleContentSearch = useCallback((query: string) => {
    setQueryAndNavigateToRoot(query);
    // Trigger search immediately for clicked examples
    if (query.trim()) {
      handleSearch(query);
    }
  }, [setQueryAndNavigateToRoot, handleSearch]);

  const contentRenderer = useContentRenderer({ setQuery, updateUrlForSearch, handleSearch, handleContentSearch });

  // While connecting, show a static placeholder; remove animated loading dots

  useEffect(() => {
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
  }, [handleSearch, manageUrl, runSlashCommand, setConnectionDetails, setIsConnecting]);

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
  }, [loading]);

  // Listen for login trigger from Header
  useEffect(() => {
    const cleanup = onLoginTrigger(() => {
      // Always attempt login, but only set /login in search field if it's empty
      if (!query.trim()) {
        setQuery('/login');
        // Focus the search input
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
        // Update URL immediately
        updateUrlForSearch('/login');
      }
      // Always execute the /login command regardless of search field state
      const unknownCmd = runSlashCommand('/login');
      if (unknownCmd) {
        setTopCommandText(buildCli(unknownCmd, 'Unknown command'));
        setTopExamples(null);
        setKindsRules(null);
      }
    });
    return cleanup;
  }, [onLoginTrigger, runSlashCommand, updateUrlForSearch, query, searchInputRef]);


  useEffect(() => {
    if (!manageUrl) return;
    const urlQueryRaw = searchParams.get('q') || '';
    const decodedQuery = decodeUrlQuery(urlQueryRaw);
    const normalizedQuery = decodedQuery.trim();
    const currentProfileNpub = getCurrentProfileNpub(pathname);

    const executeSearch = (displayValue: string, backendValue: string) => {
      if (lastHashQueryRef.current === displayValue) return;
      lastHashQueryRef.current = displayValue;
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
  }, [manageUrl, searchParams, pathname, router, runSlashCommand, handleSearch, profileScopeUser, profileScopeIdentifiers?.profileIdentifier]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectivePlaceholder = isConnecting ? '/examples' : placeholder;
    const raw = query.trim() || effectivePlaceholder;
    
    // Slash-commands: show CLI-style top card but still run normal search
    if (isSlashCommand(raw)) {
      const unknownCmd = runSlashCommand(raw);
      if (unknownCmd) {
        setTopCommandText(buildCli(unknownCmd, 'Unknown command'));
        setTopExamples(null);
        setKindsRules(null);
      }
      setQuery(raw);
      updateUrlForSearch(raw);
      // Clear prior results immediately before async search
      setResults([]);
      setTopCommandText(buildCli(raw.replace(/^\//, ''), topExamples ? topExamples : ''));
      if (raw) handleSearch(raw);
      else setResults([]);
      return;
    } else {
      // Clear any previous command card for non-command searches
      setTopCommandText(null);
      setTopExamples(null);
      setKindsRules(null);
    }
    const currentProfileNpub = getCurrentProfileNpub(pathname);
    let displayVal = raw;
    const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
    if (identifiers && profileScoped) {
      displayVal = addProfileScope(displayVal, identifiers);
    }
    setQuery(displayVal);
    if (manageUrl) {
      if (displayVal) {
        // Update URL immediately
        updateUrlForSearch(displayVal);
        const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
        const shouldScope = identifiers ? hasProfileScope(displayVal, identifiers) : false;
        const backend = shouldScope ? ensureAuthorForBackend(displayVal, currentProfileNpub) : displayVal;
        handleSearch(backend.trim());
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('q');
        router.replace(`?${params.toString()}`);
        setResults([]);
      }
    } else {
      if (displayVal) handleSearch(displayVal);
      else setResults([]);
    }
  };


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
  }, [initialQuery, manageUrl]);

  return (
    <div className="w-full pt-4">
      <PlaceholderStyles />
      <div className="flex gap-2">
        <ProfileScopeIndicator
          key={profileScopeUser?.npub || 'no-user'}
          user={profileScopeUser}
          isEnabled={profileScoped}
        />
        <SearchInput
          ref={searchInputRef}
          query={query}
          placeholder={placeholder}
          loading={loading}
          resolvingAuthor={resolvingAuthor}
          showExternalButton={showExternalButton}
          profileScopeUser={profileScopeUser}
          onInputChange={handleInputChange}
          onClear={handleClear}
          onOpenExternal={handleOpenExternal}
          onSubmit={handleSubmit}
          onExampleNext={handleExampleNext}
          rotationProgress={rotationProgress}
        />
      </div>
      
      <QueryTranslation 
        query={query} 
        onAuthorResolved={() => {
          // Re-execute search after final author resolution completes
          if (lastExecutedQueryRef.current) {
            handleSearch(lastExecutedQueryRef.current);
          }
        }} 
      />

      {/* Command output will be injected as first result card below */}

      {/* Collapsed state - always in same row */}
      {(loading || results.length > 0) && (
        <div className="w-full mt-2">
          {/* Button row - sort on left, other controls on right */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShareButton />
              {hasNonProfileResults && (
                <SortCollapsed
                  sortOrder={sortOrder}
                  onToggle={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                />
              )}
            </div>
            
            <div className="flex items-center gap-3 ml-auto">
              <RelayCollapsed
                connectedCount={successfullyActiveRelays.size}
                totalCount={relayInfo.totalCount}
                onExpand={() => setShowConnectionDetails(!showConnectionDetails)}
                isExpanded={showConnectionDetails}
              />

              <FilterCollapsed
                filtersAreActive={filterSettings.filterMode !== 'never' && (filterSettings.filterMode === 'always' || loading || (filterSettings.filterMode === 'intelligently' && results.length >= SEARCH_FILTER_THRESHOLD))}
                hasActiveFilters={filterSettings.maxEmojis !== null || filterSettings.maxHashtags !== null || filterSettings.maxMentions !== null || filterSettings.hideLinks || filterSettings.hideBridged || filterSettings.hideBots || filterSettings.hideNsfw || filterSettings.verifiedOnly || (filterSettings.fuzzyEnabled && (filterSettings.resultFilter || '').trim().length > 0)}
                filteredCount={fuseFilteredResults.length}
                resultCount={results.length}
                onExpand={() => setShowFilterDetails(!showFilterDetails)}
                isExpanded={showFilterDetails}
              />
            </div>
          </div>

          {/* Expanded views - below button row, full width */}
          {showConnectionDetails && connectionDetails && relayInfo.totalCount > 0 && (
            <RelayStatusDisplay 
              connectionDetails={connectionDetails}
              relayInfo={relayInfo}
              onSearch={handleSearch}
              activeRelays={successfullyActiveRelays}
              toggledRelays={toggledRelays}
              onToggleRelay={toggleRelay}
            />
          )}

          {showFilterDetails && (
            <div className="mt-2">
              <ClientFilters
                filterSettings={filterSettings}
                onFilterChange={setFilterSettings}
                resultCount={results.length}
                filteredCount={fuseFilteredResults.length}
                emojiAutoDisabled={emojiAutoDisabled}
                showButton={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Textbox moved inside ClientFilters 'Show:' section */}

      <SearchResultsList
        results={sortedResults}
        loading={loading}
        query={query}
        isDirectQuery={isDirectQuery}
        topCommandText={topCommandText}
        helpCommands={helpCommands}
        topExamples={topExamples}
        kindsRules={kindsRules}
        kindsLoading={kindsLoading}
        kindsError={kindsError}
        onContentSearch={handleContentSearch}
        renderer={contentRenderer}
      />
    </div>
  );
}
