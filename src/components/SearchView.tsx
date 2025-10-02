'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { connect, nextExample, ndk, ConnectionStatus, addConnectionStatusListener, removeConnectionStatusListener, getRecentlyActiveRelays } from '@/lib/ndk';
import { createSlashCommandRunner, executeClearCommand } from '@/lib/slashCommands';
import { resolveAuthorToNpub } from '@/lib/vertex';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { searchEvents } from '@/lib/search';
import { extractRelaySourcesFromEvent, createRelaySet } from '@/lib/urlUtils';
import { applyContentFilters, isEmojiSearch } from '@/lib/contentAnalysis';
import { formatUrlForDisplay, getFilenameFromUrl, extractVideoUrls } from '@/lib/utils/urlUtils';
import { stripAllUrls } from '@/lib/utils/textUtils';
import { updateSearchQuery } from '@/lib/utils/navigationUtils';
import { extractImetaImageUrls, extractImetaVideoUrls, extractImetaBlurhashes, extractImetaDimensions, extractImetaHashes } from '@/lib/picture';
// Use unified cached NIP-05 checker for DRYness and to leverage persistent cache
import { checkNip05 as verifyNip05Async } from '@/lib/vertex';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getCurrentProfileNpub, toImplicitUrlQuery, toExplicitInputFromUrl, ensureAuthorForBackend, decodeUrlQuery } from '@/lib/search/queryTransforms';
import { profileEventFromPubkey } from '@/lib/vertex';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { getProfileScopeIdentifiers, hasProfileScope, addProfileScope, removeProfileScope } from '@/lib/search/profileScope';
import { 
  UI_RECENTLY_ACTIVE_INTERVAL, 
  UI_CONNECTION_DETAILS_INTERVAL
} from '@/lib/constants';
import EventCard from '@/components/EventCard';
import ProfileCard from '@/components/ProfileCard';
import ClientFilters, { FilterSettings } from '@/components/ClientFilters';
import ProfileScopeIndicator from '@/components/ProfileScopeIndicator';
import FilterCollapsed from '@/components/FilterCollapsed';
import RelayCollapsed from '@/components/RelayCollapsed';
import RelayStatusDisplay from '@/components/RelayStatusDisplay';
import TruncatedText from '@/components/TruncatedText';
import ImageWithBlurhash from '@/components/ImageWithBlurhash';
import VideoWithBlurhash from '@/components/VideoWithBlurhash';
import SearchInput from '@/components/SearchInput';
import QueryTranslation from '@/components/QueryTranslation';
import InlineNostrToken from '@/components/InlineNostrToken';
import NoteHeader from '@/components/NoteHeader';
import NoteMedia from '@/components/NoteMedia';
import { nip19 } from 'nostr-tools';
import { extractNip19Identifiers, decodeNip19Identifier } from '@/lib/utils/nostrIdentifiers';
import { createNostrTokenRegex } from '@/lib/utils/nostrIdentifiers';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { trimImageUrl, isHashtagOnlyQuery, hashtagQueryToUrl } from '@/lib/utils';
import { getRelayLists } from '@/lib/relayCounts';
import { relaySets, getNip50SearchRelaySet } from '@/lib/relays';
import { NDKUser, NDKRelaySet } from '@nostr-dev-kit/ndk';
import emojiRegex from 'emoji-regex';
import { faExternalLink } from '@fortawesome/free-solid-svg-icons';
import { formatEventTimestamp } from '@/lib/utils/eventHelpers';
import { TEXT_MAX_LENGTH, SEARCH_FILTER_THRESHOLD } from '@/lib/constants';
import { HIGHLIGHTS_KIND } from '@/lib/highlights';




// Removed direct Highlight usage; RawEventJson handles JSON highlighting
// import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import RawEventJson from '@/components/RawEventJson';
import CodeSnippet from '@/components/CodeSnippet';
import Fuse from 'fuse.js';
import { getFilteredExamples } from '@/lib/examples';
import { isLoggedIn, login, logout } from '@/lib/nip07';
import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import { useLoginTrigger } from '@/lib/LoginTrigger';
import { useClearTrigger } from '@/lib/ClearTrigger';
import { SearchResultsPlaceholder, PlaceholderStyles } from './Placeholder';
import { detectSearchType } from '@/lib/search/searchTypeDetection';

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
  const [placeholder, setPlaceholder] = useState('/examples');
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionStatus | null>(null);
  const currentSearchId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastIdentifierRedirectRef = useRef<string | null>(null);
  const initialSearchDoneRef = useRef(false);
  const normalizedInitialQuery = initialQuery.trim() || null;
  const bootstrapInitial = !manageUrl ? normalizedInitialQuery : null;
  const initialQueryNormalizedRef = useRef<string | null>(normalizedInitialQuery);
  const initialQueryRef = useRef(initialQuery);
  const lastHashQueryRef = useRef<string | null>(bootstrapInitial);
  const lastExecutedQueryRef = useRef<string | null>(bootstrapInitial);
  const [expandedParents, setExpandedParents] = useState<Record<string, NDKEvent | 'loading'>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Removed expanded-term chip UI and related state to simplify UX
  const [rotationProgress, setRotationProgress] = useState(0);
  const [rotationSeed, setRotationSeed] = useState(0);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [showFilterDetails, setShowFilterDetails] = useState(false);
  const [recentlyActive, setRecentlyActive] = useState<string[]>([]);
  const [successfulPreviews, setSuccessfulPreviews] = useState<Set<string>>(new Set());
  const [showExternalButton, setShowExternalButton] = useState(false);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({ maxEmojis: 3, maxHashtags: 3, maxMentions: 6, hideLinks: false, hideBridged: true, resultFilter: '', verifiedOnly: false, fuzzyEnabled: true, hideBots: false, hideNsfw: false, filterMode: 'intelligently' });
  
  const [topCommandText, setTopCommandText] = useState<string | null>(null);
  const [topExamples, setTopExamples] = useState<string[] | null>(null);
  const isSlashCommand = useCallback((input: string): boolean => /^\s*\//.test(input), []);
  const { onLoginTrigger, setLoginState, setCurrentUser } = useLoginTrigger();
  const { setClearHandler } = useClearTrigger();
  
  // Determine if filters should be enabled based on filterMode
  const shouldEnableFilters = useMemo(() => {
    switch (filterSettings.filterMode) {
      case 'always':
        return true;
      case 'never':
        return false;
      case 'intelligently':
        return results.length >= SEARCH_FILTER_THRESHOLD;
      default:
        return false;
    }
  }, [filterSettings.filterMode, results.length]);
  
  // Check if query is a URL
  const isUrl = useCallback((input: string): boolean => {
    try {
      const url = new URL(input.trim());
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);
  
  // Handle opening external URL
  const handleOpenExternal = useCallback(() => {
    if (query.trim()) {
      window.open(query.trim(), '_blank', 'noopener,noreferrer');
      // Immediately transform back to regular search button
      setShowExternalButton(false);
    }
  }, [query]);
  
  const buildCli = useCallback((label: string, body: string | string[] = ''): string => {
    const lines = Array.isArray(body) ? body : [body];
    return [`$ ants ${label}`, '', ...lines].join('\n');
  }, []);
  const runSlashCommand = useMemo(() => createSlashCommandRunner({
    onHelp: (commands) => {
      const lines = ['Available commands:', ...commands.map(c => `  ${c.label.padEnd(12)} ${c.description}`)];
      setTopCommandText(buildCli('help', lines));
      setTopExamples(commands.map(c => c.label));
    },
    onExamples: () => {
      const examples = getFilteredExamples(isLoggedIn());
      setTopExamples(Array.from(examples));
      setTopCommandText(buildCli('examples'));
    },
    onLogin: async () => {
      setLoginState('logging-in');
      setTopCommandText(buildCli('login', 'Attempting login…'));
      setTopExamples(null);
      try {
        const user = await login();
        if (user) {
          // Immediately set current user and logged-in state for instant header update
          setCurrentUser(user);
          setLoginState('logged-in');
          setTopCommandText(buildCli('login', `Logged in as ${user.profile?.displayName || user.profile?.name || user.npub}`));
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
    },
    onClear: async () => {
      setTopCommandText(buildCli('clear', 'Clearing all caches...'));
      setTopExamples(null);
      try {
        await executeClearCommand();
        setTopCommandText(buildCli('clear', 'All caches cleared successfully'));
      } catch (error) {
        setTopCommandText(buildCli('clear', `Cache clearing failed: ${error}`));
      }
    }
  }), [buildCli, setTopCommandText, setPlaceholder, setTopExamples, setLoginState, setCurrentUser]);

  const [profileScopeUser, setProfileScopeUser] = useState<NDKUser | null>(null);
  const [successfullyActiveRelays, setSuccessfullyActiveRelays] = useState<Set<string>>(new Set());
  const [toggledRelays, setToggledRelays] = useState<Set<string>>(new Set());

  // Toggle relay on/off for client-side filtering
  const toggleRelay = useCallback((relayUrl: string) => {
    setToggledRelays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(relayUrl)) {
        newSet.delete(relayUrl);
      } else {
        newSet.add(relayUrl);
      }
      return newSet;
    });
  }, []);

  // Filter results based on toggled relay state
  const filterByRelays = useCallback((events: NDKEvent[]) => {
    if (toggledRelays.size === 0) {
      // No relays toggled off, return all events
      return events;
    }

    return events.filter(event => {
      const eventSources = extractRelaySourcesFromEvent(event);
      // Keep event if it has sources from toggled relays
      return eventSources.some(source => toggledRelays.has(source));
    });
  }, [toggledRelays]);

  // Simple input change handler: update local query state; searches run on submit
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    // Release suppression on next tick so explicit submit still works
    setTimeout(() => { suppressSearchRef.current = false; }, 0);
  }, [setQuery]);

  // Memoized client-side filtered results (for count and rendering)
  // Maintain a map of pubkey->verified to avoid re-verifying
  const verifiedMapRef = useRef<Map<string, boolean>>(new Map());
  // Suppress accidental searches caused by programmatic query edits (e.g., toggle)
  const suppressSearchRef = useRef(false);
 
  const relayInfo = useMemo(() => {
    const base = getRelayLists(connectionDetails, recentlyActive);
    return {
      ...base,
      relayPings: connectionDetails?.relayPings ?? new Map<string, number>(),
    };
  }, [connectionDetails, recentlyActive]);

  useEffect(() => {
    // Proactively verify missing entries (bounded to first 50) and then reorder results
    const toVerify: Array<{ pubkey: string; nip05: string }> = [];
    for (const evt of results.slice(0, 50)) {
      const pubkey = (evt.pubkey || evt.author?.pubkey) as string | undefined;
      const profile = evt.author?.profile as { nip05?: string | { url?: string; verified?: boolean } } | undefined;
      const raw = profile?.nip05;
      const nip05 = typeof raw === 'string' ? raw : raw?.url;
      const verifiedHint = typeof raw === 'object' && raw ? raw.verified : undefined;
      if (pubkey && verifiedHint === true) {
        verifiedMapRef.current.set(pubkey, true);
      }
      if (!pubkey || !nip05) continue;
      if (!verifiedMapRef.current.has(pubkey)) toVerify.push({ pubkey, nip05 });
    }
    if (toVerify.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.allSettled(toVerify.map(async ({ pubkey, nip05 }) => {
        try {
          const ok = await verifyNip05Async(pubkey, nip05);
          if (!cancelled) verifiedMapRef.current.set(pubkey, Boolean(ok));
        } catch {
          if (!cancelled) verifiedMapRef.current.set(pubkey, false);
        }
      }));
      if (cancelled) return;
      // Reorder results by verified first while preserving relative order for ties
      setResults(prev => {
        const index = new Map<string, number>();
        prev.forEach((e, i) => {
          const pk = (e.pubkey || e.author?.pubkey) as string | undefined;
          if (pk) index.set(pk, i);
        });
        const copy = [...prev];
        copy.sort((a, b) => {
          const ap = (a.pubkey || a.author?.pubkey) as string | undefined;
          const bp = (b.pubkey || b.author?.pubkey) as string | undefined;
          const av = ap ? (verifiedMapRef.current.get(ap) === true ? 1 : 0) : 0;
          const bv = bp ? (verifiedMapRef.current.get(bp) === true ? 1 : 0) : 0;
          if (av !== bv) return bv - av; // verified first
          // stable by original index
          const ai = ap ? (index.get(ap) ?? 0) : 0;
          const bi = bp ? (index.get(bp) ?? 0) : 0;
          return ai - bi;
        });
        return copy;
      });
    })();
    return () => { cancelled = true; };
  }, [results]);


  const emojiAutoDisabled = filterSettings.filterMode === 'intelligently' && isEmojiSearch(query);

  const filteredResults = useMemo(
    () => {
      let filtered = results;
      
      // Apply content filters first
      if (shouldEnableFilters) {
        filtered = applyContentFilters(
          filtered,
          // Disable emoji filter when searching for multiple emojis in Smart mode
          emojiAutoDisabled ? null : filterSettings.maxEmojis,
          filterSettings.maxHashtags,
          filterSettings.maxMentions,
          filterSettings.hideLinks,
          filterSettings.hideBridged,
          filterSettings.verifiedOnly,
          (pubkey) => Boolean(pubkey && verifiedMapRef.current.get(pubkey) === true),
          filterSettings.hideBots,
          filterSettings.hideNsfw
        );
      }
      
      // Apply relay filtering
      return filterByRelays(filtered);
    },
    [results, shouldEnableFilters, emojiAutoDisabled, filterSettings.maxEmojis, filterSettings.maxHashtags, filterSettings.maxMentions, filterSettings.hideLinks, filterSettings.hideBridged, filterSettings.verifiedOnly, filterSettings.hideBots, filterSettings.hideNsfw, filterByRelays]
  );

  // Apply optional fuzzy filter on top of client-side filters
  const fuseFilteredResults = useMemo(() => {
    const q = (shouldEnableFilters && filterSettings.fuzzyEnabled ? (filterSettings.resultFilter || '') : '').trim();
    if (!q) return filteredResults;
    const fuse = new Fuse(filteredResults, {
      includeScore: false,
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: 'content', weight: 1 }
      ]
    });
    return fuse.search(q).map(r => r.item);
  }, [filteredResults, filterSettings.resultFilter, filterSettings.fuzzyEnabled, shouldEnableFilters]);

  // Seed profile prefetch for visible profile cards as soon as results materialize
  useEffect(() => {
    try {
      for (const ev of fuseFilteredResults) {
        if (ev.kind === 0) {
          // Use author.pubkey if available, fallback to event.pubkey
          const pubkey = ev.author?.pubkey || ev.pubkey;
          if (pubkey) {
            setPrefetchedProfile(pubkey, prepareProfileEventForPrefetch(ev));
          }
        }
      }
    } catch {}
  }, [fuseFilteredResults]);

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



  useEffect(() => {
    if (!manageUrl) {
      setProfileScopeUser(null);
      return;
    }

    const currentProfileNpub = getCurrentProfileNpub(pathname);
    if (!currentProfileNpub) {
      setProfileScopeUser(null);
      return;
    }

    let cancelled = false;
    const cloneUserWithProfile = (source: NDKUser): NDKUser => {
      const clone = new NDKUser({ pubkey: source.pubkey });
      clone.ndk = ndk;
      if (source.profile) {
        clone.profile = { ...(source.profile as Record<string, unknown>) } as typeof source.profile;
      }
      return clone;
    };

    const profileHasHttpImage = (profile: unknown): boolean => {
      if (!profile || typeof profile !== 'object') return false;
      const p = profile as { image?: unknown; picture?: unknown };
      const candidate = typeof p.image === 'string' ? p.image : typeof p.picture === 'string' ? p.picture : undefined;
      return typeof candidate === 'string' && /^https?:\/\//i.test(candidate);
    };

    // Get profile data using the existing profile system
    const setupProfileUser = async () => {
      try {
        const decoded = nip19.decode(currentProfileNpub);
        if (decoded?.type === 'npub' && typeof decoded.data === 'string') {
          const pubkey = decoded.data;
          // Use the existing profile system that caches and fetches properly
          const profileEvent = await profileEventFromPubkey(pubkey);
          if (profileEvent) {
            const prepared = prepareProfileEventForPrefetch(profileEvent);
            const baseUser = prepared.author ?? new NDKUser({ pubkey });
            baseUser.ndk = ndk;
            if (!baseUser.profile) {
              baseUser.profile = profileEvent.content ? JSON.parse(profileEvent.content) : {};
            }

            setProfileScopeUser(cloneUserWithProfile(baseUser));

            // Prefetch by tag to mirror ProfileCard behaviour
            (async () => {
              try {
                const asyncUser = new NDKUser({ pubkey });
                asyncUser.ndk = ndk;
                await connect();
                await asyncUser.fetchProfile();
                if (cancelled) return;
                const hadImage = profileHasHttpImage(baseUser.profile);
                const hasImageNow = profileHasHttpImage(asyncUser.profile);
                if (!hadImage && hasImageNow) {
                  setPrefetchedProfile(pubkey, prepareProfileEventForPrefetch(new NDKEvent(ndk, {
                    kind: 0,
                    created_at: Math.floor(Date.now() / 1000),
                    content: JSON.stringify(asyncUser.profile || {}),
                    pubkey,
                    tags: [],
                    id: '',
                    sig: ''
                  })));
                  setProfileScopeUser(cloneUserWithProfile(asyncUser));
                } else if (hadImage && !hasImageNow) {
                  // keep existing image
                } else if (!hadImage && !hasImageNow) {
                  // nothing new
                } else {
                  setProfileScopeUser(prev => prev && prev.pubkey === asyncUser.pubkey ? cloneUserWithProfile(asyncUser) : prev);
                }
              } catch {
                // ignore
              }
            })();
          } else {
            setProfileScopeUser(null);
          }
        } else {
          setProfileScopeUser(null);
        }
      } catch {
        setProfileScopeUser(null);
      }
    };

    setupProfileUser();
    return () => { cancelled = true; };
  }, [manageUrl, pathname]);

  // Determine scope identifiers for current profile
  const profileScopeIdentifiers = useMemo(() => {
    const currentProfileNpub = getCurrentProfileNpub(pathname);
    if (!currentProfileNpub) return null;
    const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
    if (!identifiers) return null;
    return identifiers;
  }, [profileScopeUser, pathname]);

  const profileScoped = useMemo(() => {
    if (!profileScopeIdentifiers) return false;
    return hasProfileScope(query, profileScopeIdentifiers);
  }, [query, profileScopeIdentifiers]);

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
        !identifierOnly && isUrl(normalizedInput) && normalizedInput.toLowerCase().includes(identifierLower);

      if (identifierOnly || identifierInUrl) {
        setTopCommandText(null);
        setTopExamples(null);
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
      setShowExternalButton(false);
    }
    setResults([]);
    setLoading(true);
    
    
    // Ensure loading animation is visible for direct lookups
    const isDirectLookup = !manageUrl && initialQuery === searchQuery;
    const minLoadingTime = isDirectLookup ? 800 : 0;
    
    // Check if we need to resolve an author first
    const byMatch = searchQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
    const needsAuthorResolution = byMatch && !/^npub1[0-9a-z]+$/i.test(byMatch[1]);
    
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
      const isUrlQueryResult = isUrl(searchQuery);
      setShowExternalButton(isUrlQueryResult && filtered.length === 0);
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
  }, [pathname, router, isSlashCommand, isUrl, updateUrlForSearch, profileScopeUser, initialQuery, manageUrl, isDirectQuery]);

  // DRY helper for content-based search triggers (always root searches)
  const handleContentSearch = useCallback((query: string) => {
    setQueryAndNavigateToRoot(query);
    // Trigger search immediately for clicked examples
    if (query.trim()) {
      handleSearch(query);
    }
  }, [setQueryAndNavigateToRoot, handleSearch]);

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
            }
            handleSearch(initialQueryRef.current);
          } else {
            handleSearch(normalizedInitial);
          }
        }
      }
    };
    initializeNDK();
  }, [handleSearch, manageUrl, runSlashCommand, isSlashCommand, buildCli]);

  // Listen for connection status changes
  useEffect(() => {
    const handleConnectionStatusChange = (status: ConnectionStatus) => {
      setConnectionDetails(status);
      // Auto-hide connection details when status changes
      setShowConnectionDetails(false);
      // Refresh recently active relays on changes
      setRecentlyActive(getRecentlyActiveRelays());
    };

    addConnectionStatusListener(handleConnectionStatusChange);
    
    return () => {
      removeConnectionStatusListener(handleConnectionStatusChange);
    };
  }, []);

  // Periodically refresh recently active relays while panel open (reduced frequency)
  useEffect(() => {
    if (!showConnectionDetails) return;
    setRecentlyActive(getRecentlyActiveRelays());
    const id = setInterval(() => setRecentlyActive(getRecentlyActiveRelays()), UI_CONNECTION_DETAILS_INTERVAL);
    return () => clearInterval(id);
  }, [showConnectionDetails]);

  // Update recently active relays immediately when connection status changes
  useEffect(() => {
    setRecentlyActive(getRecentlyActiveRelays());
  }, [connectionDetails]);

  // Periodically update recently active relays to catch relay activity changes (reduced frequency)
  useEffect(() => {
    const id = setInterval(() => {
      setRecentlyActive(getRecentlyActiveRelays());
    }, UI_RECENTLY_ACTIVE_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Update recently active relays when results change (events received)
  useEffect(() => {
    if (results.length > 0) {
      setRecentlyActive(getRecentlyActiveRelays());
    }
  }, [results.length]);


  // Removed separate RecentlyActiveRelays section; now merged into Reachable

  // Rotate placeholder when idle and show a small progress indicator
  useEffect(() => {
    if (query || loading) { setRotationProgress(0); return; }
    let rafId = 0;
    const ROTATION_MS = 7000;
    let start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / ROTATION_MS);
      setRotationProgress(p);
      if (p >= 1) {
        setPlaceholder(nextExample());
        start = now;
        setRotationProgress(0);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafId); };
  }, [query, loading, rotationSeed]);


  // Auto-focus the search input on component mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

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
      }
    });
    return cleanup;
  }, [onLoginTrigger, runSlashCommand, updateUrlForSearch, query, buildCli]);


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
      }
      return;
    }

    executeSearch(normalizedQuery, normalizedQuery);
  }, [manageUrl, searchParams, pathname, router, runSlashCommand, handleSearch, isSlashCommand, profileScopeUser, profileScopeIdentifiers?.profileIdentifier, buildCli]);

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


  const goToProfile = useCallback((npub: string, prefetchEvent?: NDKEvent) => {
    try {
      if (prefetchEvent) {
        const { data } = nip19.decode(npub);
        const pk = data as string;
        setPrefetchedProfile(pk, prepareProfileEventForPrefetch(prefetchEvent));
      }
    } catch {}
    router.push(`/p/${npub}`);
  }, [router]);

  // DRY helper for nevent search buttons
  const handleNeventSearch = useCallback((eventId: string) => {
    try {
      const nevent = nip19.neventEncode({ id: eventId });
      setQuery(nevent);
      updateUrlForSearch(nevent);
      handleSearch(nevent);
    } catch {}
  }, [setQuery, updateUrlForSearch, handleSearch]);

  // DRY component for nevent search buttons
  const NeventSearchButton = useCallback(({ eventId, timestamp }: { eventId: string; timestamp: string }) => (
    <button
      type="button"
      className="text-xs hover:underline"
      title="Search this nevent"
      onClick={() => handleNeventSearch(eventId)}
    >
      {timestamp}
    </button>
  ), [handleNeventSearch]);

  // DRY helper for common EventCard props
  const getCommonEventCardProps = useCallback((event: NDKEvent, className: string) => ({
    event,
    onAuthorClick: goToProfile,
    className,
    footerRight: <NeventSearchButton eventId={event.id} timestamp={formatEventTimestamp(event)} />
  }), [goToProfile, NeventSearchButton]);





  // Use the utility function from urlUtils


  const renderContentWithClickableHashtags = useCallback((content: string, options?: { disableNevent?: boolean; skipIdentifierIds?: Set<string> }) => {
    const strippedContent = stripAllUrls(content, successfulPreviews);
    if (!strippedContent) return null;

    const initialIdentifierIds = options?.skipIdentifierIds
      ? Array.from(options.skipIdentifierIds, (id) => id.toLowerCase())
      : [];
    const seenIdentifierIds = new Set<string>(initialIdentifierIds);

    const deriveIdentifierKey = (token: string): string | null => {
      if (!/^nostr:(?:nevent1|naddr1|note1)/i.test(token)) return null;
      try {
        const decoded = nip19.decode(token.replace(/^nostr:/i, ''));
        if (!decoded) return null;

        if (decoded.type === 'nevent') {
          const data = decoded.data as { id?: string };
          const id = (data?.id || '').toLowerCase();
          return id || null;
        }

        if (decoded.type === 'note') {
          const noteId = (decoded.data as string) || '';
          return noteId ? noteId.toLowerCase() : null;
        }

        if (decoded.type === 'naddr') {
          const data = decoded.data as { pubkey?: string; identifier?: string; kind?: number };
          const kind = typeof data?.kind === 'number' ? data.kind : '';
          const pubkey = (data?.pubkey || '').toLowerCase();
          const identifier = (data?.identifier || '').toLowerCase();
          if (!pubkey || !identifier || kind === '') return null;
          return `${kind}:${pubkey}:${identifier}`;
        }
      } catch {}
      return null;
    };

    const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
    const nostrPattern = createNostrTokenRegex();
    const hashtagRegex = /(#\w+)/g;
    const emojiRx = emojiRegex();

    const splitByUrls = strippedContent.split(urlRegex);
    const finalNodes: (string | React.ReactNode)[] = [];

    splitByUrls.forEach((segment, segIndex) => {
      const isUrl = /^https?:\/\//i.test(segment);
      if (isUrl) {
        const cleanedUrl = segment.replace(/[),.;]+$/, '').trim();
        const { displayText, fullUrl } = formatUrlForDisplay(cleanedUrl, 25);
        finalNodes.push(
          <span key={`url-${segIndex}`} className="inline-flex items-center gap-1">
            <button
              type="button"
              className="text-blue-400 hover:text-blue-300 hover:underline break-all text-left"
              onClick={(e) => { 
                e.stopPropagation();
                handleContentSearch(fullUrl);
              }}
              title={`Search for: ${fullUrl}`}
            >
              {displayText}
            </button>
            <button
              type="button"
              title="Open URL in new tab"
              className="p-0.5 text-gray-400 hover:text-gray-200 opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                window.open(fullUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <FontAwesomeIcon icon={faExternalLink} className="text-xs" />
            </button>
          </span>
        );
        return;
      }

      // Process nostr tokens, hashtags, and emojis
      const nostrSplitRegex = new RegExp(nostrPattern.source, nostrPattern.flags);
      const segmentTokens: string[] = [];
      const segmentParts: string[] = [];
      let lastIndex = 0;
      let execMatch: RegExpExecArray | null;
      while ((execMatch = nostrSplitRegex.exec(segment)) !== null) {
        const tokenStart = execMatch.index;
        const tokenEnd = tokenStart + execMatch[0].length;
        segmentParts.push(segment.slice(lastIndex, tokenStart));
        segmentTokens.push(execMatch[0]);
        lastIndex = tokenEnd;
      }
      segmentParts.push(segment.slice(lastIndex));
      const nostrSplit = segmentParts;
      const nostrTokens = segmentTokens;
      
      nostrSplit.forEach((textPart, partIndex) => {
        if (textPart) {
          // Process hashtags and emojis in text
          const hashtagSplit = textPart.split(hashtagRegex);
          hashtagSplit.forEach((hashtagPart, hashtagIndex) => {
            if (hashtagPart.startsWith('#')) {
              finalNodes.push(
                <button
                  key={`hashtag-${segIndex}-${partIndex}-${hashtagIndex}`}
                  onClick={() => handleContentSearch(hashtagPart)}
                  className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                >
                  {hashtagPart}
                </button>
              );
            } else if (hashtagPart && hashtagPart.trim()) {
              // Process emojis
              const emojiSplit = hashtagPart.split(emojiRx);
              const emojis = hashtagPart.match(emojiRx) || [];
              emojiSplit.forEach((emojiPart, emojiIndex) => {
                if (emojiPart) finalNodes.push(emojiPart);
                if (emojis[emojiIndex]) {
                  finalNodes.push(
                    <button
                      key={`emoji-${segIndex}-${partIndex}-${hashtagIndex}-${emojiIndex}`}
                      onClick={() => handleContentSearch(emojis[emojiIndex] as string)}
                      className="text-yellow-400 hover:text-yellow-300 hover:scale-110 transition-transform cursor-pointer"
                    >
                      {emojis[emojiIndex]}
                    </button>
                  );
                }
              });
            } else {
              finalNodes.push(hashtagPart);
            }
          });
        }
        
        // Add nostr token if it exists
        if (nostrTokens[partIndex]) {
          const token = nostrTokens[partIndex];
          
          const identifierKey = deriveIdentifierKey(token);
          if (identifierKey) {
            if (seenIdentifierIds.has(identifierKey)) {
              return;
            }
            seenIdentifierIds.add(identifierKey);
          }
          
          if (options?.disableNevent && /^nostr:(?:nevent1|naddr1|note1)/i.test(token)) {
            finalNodes.push(token);
          } else {
            finalNodes.push(
              <InlineNostrToken
                key={`nostr-${segIndex}-${partIndex}`}
                token={token}
                onProfileClick={goToProfile}
                onSearch={handleContentSearch}
                renderContentWithClickableHashtags={renderContentWithClickableHashtags}
              />
            );
          }
        }
      });
    });

    return finalNodes;
  }, [successfulPreviews, handleContentSearch, goToProfile]);

  const getReplyToEventId = useCallback((event: NDKEvent): string | null => {
    try {
      const eTags = (event.tags || []).filter((t) => t && t[0] === 'e');
      if (eTags.length === 0) return null;

      // Deduplicate e tags by event ID to prevent duplicate quoted events
      const uniqueETags = new Map<string, typeof eTags[0]>();
      eTags.forEach((tag) => {
        const eventId = tag[1];
        if (eventId && !uniqueETags.has(eventId)) {
          uniqueETags.set(eventId, tag);
        }
      });
      const deduplicatedETags = Array.from(uniqueETags.values());

      const replyTag = deduplicatedETags.find((t) => t[3] === 'reply') || deduplicatedETags.find((t) => t[3] === 'root') || deduplicatedETags[deduplicatedETags.length - 1];
      return replyTag && replyTag[1] ? replyTag[1] : null;
    } catch {
      return null;
    }
  }, []);

  // toPlainEvent moved to shared util; RawEventJson will use it.


  const renderNoteMedia = useCallback((content: string) => (
    <NoteMedia
      content={content}
      onSearch={handleContentSearch}
      onUrlLoaded={(loadedUrl) => {
        setSuccessfulPreviews((prev) => {
          if (prev.has(loadedUrl)) return prev;
          const next = new Set(prev);
          next.add(loadedUrl);
          return next;
        });
      }}
    />
  ), [handleContentSearch]);

  const handleParentToggle = useCallback((parentId: string, parent: NDKEvent | 'loading' | null) => {
    if (parent === null) {
      const updated = { ...expandedParents };
      delete updated[parentId];
      setExpandedParents(updated);
    } else {
      setExpandedParents((prev) => ({ ...prev, [parentId]: parent }));
    }
  }, [expandedParents, setExpandedParents]);

  const renderNoteHeader = useCallback((event: NDKEvent): React.ReactNode => {
    // Hide header for profile events (kind:0)
    if (event.kind === 0) return null;
    return (
      <NoteHeader
        event={event}
        expandedParents={expandedParents}
        onParentToggle={handleParentToggle}
        onSearch={handleSearch}
      />
    );
  }, [expandedParents, handleParentToggle, handleSearch]);

  const renderParentChain = useCallback((event: NDKEvent): React.ReactNode => {
    const parentChain: NDKEvent[] = [];
    let currentEvent = event;
    
    // Build the parent chain by following expanded parents
    while (currentEvent) {
      const parentId = getReplyToEventId(currentEvent);
      if (!parentId) break;
      
      const parentState = expandedParents[parentId];
      if (parentState && parentState !== 'loading' && parentState !== null) {
        parentChain.push(parentState as NDKEvent);
        currentEvent = parentState as NDKEvent;
      } else {
        break;
      }
    }
    
    // Render all parents as stacked blocks (reverse order so most recent is on top)
    return parentChain.reverse().map((parentEvent, index) => (
      <EventCard
        key={`parent-${parentEvent.id}-${index}`}
        event={parentEvent}
        onAuthorClick={goToProfile}
        renderContent={(text) => (
          <TruncatedText 
            content={text} 
            maxLength={TEXT_MAX_LENGTH}
            className="text-gray-100 whitespace-pre-wrap break-words"
            renderContentWithClickableHashtags={renderContentWithClickableHashtags}
          />
        )}
        mediaRenderer={renderNoteMedia}
        className="relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] border-t-0 w-full rounded-none"
        showFooter={true}
        footerRight={<NeventSearchButton eventId={parentEvent.id} timestamp={formatEventTimestamp(parentEvent)} />}
      />
    ));
  }, [expandedParents, goToProfile, renderContentWithClickableHashtags, renderNoteMedia, getReplyToEventId, NeventSearchButton]);

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
    // Always reset to root path when clearing
    router.replace('/');
  }, [router]);

  // Register clear handler for favicon click
  useEffect(() => {
    setClearHandler(handleClear);
  }, [setClearHandler, handleClear]);

  const handleExampleNext = useCallback(() => {
    setPlaceholder(nextExample());
    setRotationProgress(0);
    setRotationSeed((s) => s + 1);
  }, []);


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
          onToggle={() => {
            if (!profileScopeIdentifiers) return;
            suppressSearchRef.current = true;
            const currentQuery = query.trim();
            const hasScope = hasProfileScope(currentQuery, profileScopeIdentifiers);
            const updatedQuery = hasScope
              ? removeProfileScope(currentQuery, profileScopeIdentifiers)
              : addProfileScope(currentQuery, profileScopeIdentifiers);
            setQuery(updatedQuery);
            setTimeout(() => {
              suppressSearchRef.current = false;
            }, 0);
          }}
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
          {/* Button row - always collapsed states */}
          <div className="flex items-center justify-end gap-3">
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

      {useMemo(() => {
        const finalResults = fuseFilteredResults;
        return (
          <div className="mt-8 space-y-4">
            {topCommandText ? (
              <EventCard
                event={new NDKEvent(ndk)}
                onAuthorClick={goToProfile}
                renderContent={() => (
                  topExamples && topExamples.length > 0 ? (
                    <pre className="text-xs overflow-x-auto rounded-md p-3 bg-[#1f1f1f] border border-[#3d3d3d]">
                      <div>$ ants examples</div>
                      <div>&nbsp;</div>
                      {topExamples.map((ex, idx) => (
                        <div key={`${ex}-${idx}`}>
                          <button
                            type="button"
                            className="text-left w-full hover:underline"
                            onClick={() => handleContentSearch(ex)}
                          >
                            {ex}
                          </button>
                        </div>
                      ))}
                    </pre>
                  ) : (
                    <Highlight code={topCommandText} language="bash" theme={themes.nightOwl}>
                      {({ className: cls, style, tokens, getLineProps, getTokenProps }: RenderProps) => (
                        <pre
                          className={`${cls} text-xs overflow-x-auto rounded-md p-3 bg-[#1f1f1f] border border-[#3d3d3d]`.trim()}
                          style={{ ...style, background: 'transparent', whiteSpace: 'pre' }}
                        >
                          {tokens.map((line, i) => (
                            <div key={`cmd-${i}`} {...getLineProps({ line })}>
                              {line.map((token, key) => (
                                <span key={`cmd-t-${i}-${key}`} {...getTokenProps({ token })} />
                              ))}
                            </div>
                          ))}
                        </pre>
                      )}
                    </Highlight>
                  )
                )}
                variant="card"
                showFooter={false}
              />
            ) : null}
            {loading && finalResults.length === 0 && (
              <SearchResultsPlaceholder 
                count={isDirectQuery ? 1 : 2} 
                searchType={detectSearchType(query)}
              />
            )}
            {finalResults.map((event, idx) => {
              // Check if this note has any parent chain blocks rendered above it
              const hasExpandedParents = (() => {
                let currentEvent = event;
                while (currentEvent) {
                  const parentId = getReplyToEventId(currentEvent);
                  if (!parentId) break;
                  const parentState = expandedParents[parentId];
                  if (parentState && parentState !== 'loading' && parentState !== null) {
                    return true;
                  }
                  currentEvent = parentState as unknown as NDKEvent;
                }
                return false;
              })();
              
              const noteCardClasses = `relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] rounded-t-none border-t-0 ${hasExpandedParents ? 'rounded-none' : 'rounded-b-lg'}`;
              const key = `${event.id || 'unknown'}:${idx}`;
              return (
                <div key={key}>
                  {renderNoteHeader(event)}
                  {renderParentChain(event)}
                  {event.kind === 0 ? (
                    <ProfileCard event={event} onAuthorClick={(npub) => goToProfile(npub, event)} showBanner={false} />
                  ) : event.kind === 1 ? (
                    <EventCard
                      {...getCommonEventCardProps(event, noteCardClasses)}
                      renderContent={(text) => (
                        <TruncatedText 
                          content={text} 
                          maxLength={TEXT_MAX_LENGTH}
                          className="text-gray-100 whitespace-pre-wrap break-words"
                  renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { skipIdentifierIds: new Set([event.id?.toLowerCase?.() || '']) })}
                        />
                      )}
                      mediaRenderer={renderNoteMedia}
                    />
                  ) : event.kind === 20 ? (
                    <EventCard
                      {...getCommonEventCardProps(event, noteCardClasses)}
                      renderContent={() => {
                        const urls = extractImetaImageUrls(event);
                        const blurhashes = extractImetaBlurhashes(event);
                        const dimensions = extractImetaDimensions(event);
                        const hashes = extractImetaHashes(event);
                        if (urls.length === 0) {
                          return <div className="text-gray-400">(no images)</div>;
                        }
                        return (
                          <div className="mt-0 grid grid-cols-1 gap-3">
                            {urls.map((src, idx) => {
                              const blurhash = blurhashes[idx] || blurhashes[0];
                              const dim = dimensions[idx] || dimensions[0];
                              const hash = hashes[idx] || hashes[0] || null;
                              return (
                                <div key={`image-${idx}-${src}`} className="relative">
                                  <ImageWithBlurhash
                                    src={trimImageUrl(src)}
                                    blurhash={blurhash}
                                    alt="picture"
                                    width={dim?.width || 1024}
                                    height={dim?.height || 1024}
                                    dim={dim || null}
                                    onClickSearch={() => handleContentSearch(hash ? hash : getFilenameFromUrl(src))}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                  ) : event.kind === 1337 ? (
                    <EventCard
                      {...getCommonEventCardProps(event, noteCardClasses)}
                      renderContent={() => (
                        <CodeSnippet event={event} onSearch={handleContentSearch} />
                      )}
                    />
                  ) : event.kind === 21 || event.kind === 22 ? (
                    <EventCard
                      {...getCommonEventCardProps(event, noteCardClasses)}
                      renderContent={() => {
                        const urls = extractImetaVideoUrls(event);
                        const contentUrls = extractVideoUrls(event.content || '').slice(0, 2);
                        const blurhashes = extractImetaBlurhashes(event);
                        const dimensions = extractImetaDimensions(event);
                        const hashes = extractImetaHashes(event);
                        const all = Array.from(new Set([...
                          urls,
                          ...contentUrls
                        ]));
                        if (all.length === 0) {
                          return <div className="text-gray-400">(no video)</div>;
                        }
                        return (
                          <div className="mt-0 grid grid-cols-1 gap-3">
                            {all.map((src, idx) => {
                              const blurhash = blurhashes[idx] || blurhashes[0];
                              const dim = dimensions[idx] || dimensions[0];
                              const hash = hashes[idx] || hashes[0] || null;
                              return (
                                <div key={`video-${idx}-${src}`} className="relative">
                                  <VideoWithBlurhash
                                    src={trimImageUrl(src)}
                                    blurhash={blurhash}
                                    dim={dim || null}
                                    onClickSearch={() => handleContentSearch(hash ? hash : getFilenameFromUrl(src))}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                  ) : event.kind === HIGHLIGHTS_KIND ? (
                    <EventCard
                      {...getCommonEventCardProps(event, noteCardClasses)}
                      renderContent={(text) => (
                        <TruncatedText 
                          content={text} 
                          maxLength={TEXT_MAX_LENGTH}
                          className="text-gray-100 whitespace-pre-wrap break-words"
                          renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { skipIdentifierIds: new Set([event.id?.toLowerCase?.() || '']) })}
                        />
                      )}
                      mediaRenderer={renderNoteMedia}
                    />
                  ) : (
                    <EventCard
                      {...getCommonEventCardProps(event, noteCardClasses)}
                      renderContent={() => (
                        <RawEventJson event={event} />
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      }, [fuseFilteredResults, expandedParents, goToProfile, renderContentWithClickableHashtags, renderNoteMedia, renderNoteHeader, renderParentChain, getReplyToEventId, topCommandText, topExamples, handleContentSearch, getCommonEventCardProps, isDirectQuery, loading, query])}
    </div>
  );
}


