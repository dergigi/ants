'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { connect, nextExample, ndk, ConnectionStatus, addConnectionStatusListener, removeConnectionStatusListener, getRecentlyActiveRelays } from '@/lib/ndk';
import { calculateRelayCounts } from '@/lib/relayCounts';
import { resolveAuthorToNpub } from '@/lib/vertex';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { searchEvents, expandParenthesizedOr, parseOrQuery } from '@/lib/search';
import { applySimpleReplacements } from '@/lib/search/replacements';
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
import { getProfileScopeIdentifiers, hasProfileScope, addProfileScope, removeProfileScope } from '@/lib/search/profileScope';
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
import ParentChain from '@/components/ParentChain';
import NoteMedia from '@/components/NoteMedia';
import { nip19 } from 'nostr-tools';
import { extractNip19Identifiers, decodeNip19Pointer } from '@/lib/utils/nostrIdentifiers';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { trimImageUrl, isHashtagOnlyQuery, hashtagQueryToUrl } from '@/lib/utils';
import { NDKUser } from '@nostr-dev-kit/ndk';
import emojiRegex from 'emoji-regex';
import { faExternalLink } from '@fortawesome/free-solid-svg-icons';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { formatEventTimestamp } from '@/lib/utils/eventHelpers';
import { TEXT_MAX_LENGTH, SEARCH_FILTER_THRESHOLD } from '@/lib/constants';
import { HIGHLIGHTS_KIND } from '@/lib/highlights';




// Removed direct Highlight usage; RawEventJson handles JSON highlighting
// import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import RawEventJson from '@/components/RawEventJson';
import Fuse from 'fuse.js';
import { getFilteredExamples } from '@/lib/examples';
import { isLoggedIn, login, logout } from '@/lib/nip07';
import { Highlight, themes, type RenderProps } from 'prism-react-renderer';

type Props = {
  initialQuery?: string;
  manageUrl?: boolean;
  onUrlUpdate?: (query: string) => void;
};



// (Local AuthorBadge removed; using global `components/AuthorBadge` inside EventCard.)

export default function SearchView({ initialQuery = '', manageUrl = true, onUrlUpdate }: Props) {
  const SLASH_COMMANDS = useMemo(() => ([
    { key: 'help', label: '/help', description: 'Show this help' },
    { key: 'examples', label: '/examples', description: 'List example queries' },
    { key: 'login', label: '/login', description: 'Connect with NIP-07' },
    { key: 'logout', label: '/logout', description: 'Clear session' }
  ] as const), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingAuthor, setResolvingAuthor] = useState(false);
  const [placeholder, setPlaceholder] = useState('/examples');
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'timeout'>('connecting');
  const [connectionDetails, setConnectionDetails] = useState<ConnectionStatus | null>(null);
  const currentSearchId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPointerRedirectRef = useRef<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Record<string, NDKEvent | 'loading'>>({});
  const [avatarOverlap, setAvatarOverlap] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Removed expanded-term chip UI and related state to simplify UX
  const [rotationProgress, setRotationProgress] = useState(0);
  const [rotationSeed, setRotationSeed] = useState(0);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [showFilterDetails, setShowFilterDetails] = useState(false);
  const [recentlyActive, setRecentlyActive] = useState<string[]>([]);
  const [successfulPreviews, setSuccessfulPreviews] = useState<Set<string>>(new Set());
  const [translation, setTranslation] = useState<string>('');
  const [showExternalButton, setShowExternalButton] = useState(false);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({ maxEmojis: 3, maxHashtags: 3, maxMentions: 6, hideLinks: false, hideBridged: true, resultFilter: '', verifiedOnly: false, fuzzyEnabled: true, hideBots: false, hideNsfw: false, filterMode: 'intelligently' });
  const [topCommandText, setTopCommandText] = useState<string | null>(null);
  const [topExamples, setTopExamples] = useState<string[] | null>(null);
  const isSlashCommand = useCallback((input: string): boolean => /^\s*\//.test(input), []);
  
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
  const runSlashCommand = useCallback((rawInput: string) => {
    const cmd = rawInput.replace(/^\s*\//, '').trim().toLowerCase();
    if (cmd === 'help') {
      const lines = ['Available commands:', ...SLASH_COMMANDS.map(c => `  ${c.label.padEnd(12)} ${c.description}`)];
      setTopCommandText(buildCli('--help', lines));
      setTopExamples(SLASH_COMMANDS.map(c => c.label));
      return;
    }
    if (cmd === 'examples') {
      const examples = getFilteredExamples(isLoggedIn());
      setTopExamples(Array.from(examples));
      setTopCommandText(buildCli('examples'));
      return;
    }
    if (cmd === 'login') {
      setTopCommandText(buildCli('login', 'Attempting login…'));
      setTopExamples(null);
      (async () => {
        try {
          const user = await login();
          if (user) {
            try { await user.fetchProfile(); } catch {}
            setTopCommandText(buildCli('login', `Logged in as ${user.profile?.displayName || user.profile?.name || user.npub}`));
            setPlaceholder(nextExample());
          } else {
            setTopCommandText(buildCli('login', 'Login cancelled'));
          }
        } catch {
          setTopCommandText(buildCli('login', 'Login failed. Ensure a NIP-07 extension is installed.'));
        }
      })();
      return;
    }
    if (cmd === 'logout') {
      try {
        logout();
        setTopCommandText(buildCli('logout', 'Logged out'));
        setPlaceholder(nextExample());
      } catch {
        setTopCommandText(buildCli('logout', 'Logout failed'));
      }
      setTopExamples(null);
      return;
    }
    setTopCommandText(buildCli(cmd, 'Unknown command'));
    setTopExamples(null);
  }, [buildCli, setTopCommandText, setPlaceholder, SLASH_COMMANDS]);

  const [profileScopeUser, setProfileScopeUser] = useState<NDKUser | null>(null);

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
    () => shouldEnableFilters ? applyContentFilters(
      results,
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
    ) : results,
    [results, shouldEnableFilters, emojiAutoDisabled, filterSettings.maxEmojis, filterSettings.maxHashtags, filterSettings.maxMentions, filterSettings.hideLinks, filterSettings.hideBridged, filterSettings.verifiedOnly, filterSettings.hideBots, filterSettings.hideNsfw]
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
    
    // Check if this is a hashtag-only query and we're not already on a profile page
    const currentProfileNpub = getCurrentProfileNpub(pathname);
    if (!currentProfileNpub && isHashtagOnlyQuery(searchQuery)) {
      const hashtagUrl = hashtagQueryToUrl(searchQuery);
      if (hashtagUrl) {
        router.replace(`/t/${hashtagUrl}`);
        return;
      }
    }
    
    if (currentProfileNpub) {
      // URL should be implicit on profile pages: strip matching by:npub
      const urlValue = toImplicitUrlQuery(searchQuery, currentProfileNpub);
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', urlValue);
      router.replace(`?${params.toString()}`);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', searchQuery);
      router.replace(`?${params.toString()}`);
    }
  }, [manageUrl, onUrlUpdate, pathname, searchParams, router]);

  // DRY helper function for setting query and updating URL
  const setQueryAndUpdateUrl = useCallback((query: string) => {
    setQuery(query);
    updateUrlForSearch(query);
  }, [updateUrlForSearch]);

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

    // Get profile data using the existing profile system
    const setupProfileUser = async () => {
      try {
        const decoded = nip19.decode(currentProfileNpub);
        if (decoded?.type === 'npub' && typeof decoded.data === 'string') {
          const pubkey = decoded.data;
          // Use the existing profile system that caches and fetches properly
          const profileEvent = await profileEventFromPubkey(pubkey);
          if (profileEvent) {
            const user = new NDKUser({ pubkey });
            user.ndk = ndk;
            // Attach the profile data from the cached/complete profile event
            user.profile = profileEvent.content ? JSON.parse(profileEvent.content) : {};
            setProfileScopeUser(user);
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

    // Update URL immediately when search is triggered (but not if we're on /t/ path with hashtag-only query)
    const isOnTagPath = pathname?.startsWith('/t/');
    const normalizedInput = searchQuery.trim();
    const nip19Identifiers = extractNip19Identifiers(normalizedInput);
    const pointerToken = nip19Identifiers.length > 0 ? nip19Identifiers[0].trim() : null;
    const pointerLower = pointerToken ? pointerToken.toLowerCase() : null;
    const firstPointer = pointerLower ? decodeNip19Pointer(pointerLower) : null;

    if (pointerLower && pointerLower === lastPointerRedirectRef.current) {
      lastPointerRedirectRef.current = null;
    } else if (pointerLower && firstPointer) {
      const stripped = normalizedInput
        .replace(/^web\+nostr:/i, '')
        .replace(/^nostr:/i, '')
        .replace(/[\s),.;]*$/, '')
        .trim()
        .toLowerCase();
      const pointerOnly = stripped === pointerLower;
      const pointerInUrl = !pointerOnly && isUrl(normalizedInput) && normalizedInput.toLowerCase().includes(pointerLower);

      if (pointerOnly || pointerInUrl) {
        setTopCommandText(null);
        setTopExamples(null);
        setShowExternalButton(false);
        setResults([]);
        setLoading(false);
        setResolvingAuthor(false);

        if (firstPointer.type === 'nevent' || firstPointer.type === 'note' || firstPointer.type === 'naddr') {
          lastPointerRedirectRef.current = pointerLower;
          router.push(`/e/${pointerLower}`);
          return;
        }
        if (firstPointer.type === 'nprofile' || firstPointer.type === 'npub') {
          lastPointerRedirectRef.current = pointerLower;
          router.push(`/p/${pointerLower}`);
          return;
        }
      }
    }

    const isHashtagQuery = isHashtagOnlyQuery(searchQuery);
    
    if (!(isOnTagPath && isHashtagQuery)) {
      updateUrlForSearch(searchQuery);
    }

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

      const expanded = await applySimpleReplacements(effectiveQuery);
      const currentProfileNpub = getCurrentProfileNpub(pathname);
      const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
      const shouldScope = identifiers ? hasProfileScope(expanded, identifiers) : false;
      const scopedQuery = shouldScope ? ensureAuthorForBackend(expanded, currentProfileNpub) : expanded;
      const searchResults = await searchEvents(scopedQuery, 200, undefined, undefined, abortController.signal);
      
      // Check if search was aborted after getting results
      if (abortController.signal.aborted || currentSearchId.current !== searchId) {
        return;
      }

      const filtered = applyClientFilters(searchResults, [], new Set<string>());
      setResults(filtered);
      
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
        setLoading(false);
        setResolvingAuthor(false);
      }
    }
  }, [pathname, router, isSlashCommand, isUrl, updateUrlForSearch, profileScopeUser]);

  // While connecting, show a static placeholder; remove animated loading dots

  useEffect(() => {
    const initializeNDK = async () => {
      setIsConnecting(true);
      setConnectionStatus('connecting');
      const connectionResult = await connect(8000); // 8 second timeout for more reliable initial connect
      setIsConnecting(false);
      setConnectionDetails(connectionResult);
      
      if (connectionResult.success) {
        console.log('NDK connected successfully');
        setConnectionStatus('connected');
      } else {
        console.warn('NDK connection timed out, but search will still work with available relays');
        setConnectionStatus('timeout');
      }
      
      if (initialQuery && !manageUrl) {
        setQuery(initialQuery);
        if (isSlashCommand(initialQuery)) runSlashCommand(initialQuery);
        handleSearch(initialQuery);
      }
    };
    initializeNDK();
  }, [handleSearch, initialQuery, manageUrl, runSlashCommand, isSlashCommand]);

  // Listen for connection status changes
  useEffect(() => {
    const handleConnectionStatusChange = (status: ConnectionStatus) => {
      setConnectionDetails(status);
      if (status.success) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('timeout');
      }
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

  // Periodically refresh recently active relays while panel open
  useEffect(() => {
    if (!showConnectionDetails) return;
    setRecentlyActive(getRecentlyActiveRelays());
    const id = setInterval(() => setRecentlyActive(getRecentlyActiveRelays()), 5000);
    return () => clearInterval(id);
  }, [showConnectionDetails]);


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

  // Dynamically add right padding only when the fixed header avatar overlaps the search row
  useEffect(() => {
    const computeOverlap = () => {
      const avatar = document.getElementById('header-avatar');
      const row = document.getElementById('search-row');
      if (!avatar || !row) { setAvatarOverlap(false); return; }
      const a = avatar.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const intersectsVertically = a.bottom > r.top && a.top < r.bottom;
      const intersectsHorizontally = a.left < r.right && a.right > r.left;
      setAvatarOverlap(intersectsVertically && intersectsHorizontally);
    };
    computeOverlap();
    const onResize = () => computeOverlap();
    window.addEventListener('resize', onResize);
    const interval = setInterval(computeOverlap, 500);
    return () => { window.removeEventListener('resize', onResize); clearInterval(interval); };
  }, []);

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

  useEffect(() => {
    if (!manageUrl) return;
    const urlQueryRaw = searchParams.get('q') || '';
    const urlQuery = decodeUrlQuery(urlQueryRaw);
    const currentProfileNpub = getCurrentProfileNpub(pathname);
    if (currentProfileNpub) {
      if (isSlashCommand(urlQuery)) {
        setQuery(urlQuery);
        runSlashCommand(urlQuery);
        handleSearch(urlQuery);
      } else {
        // Use normalized NIP-05 if available for display, otherwise use npub
        const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
        const displayIdentifier = identifiers?.profileIdentifier || currentProfileNpub;
        const display = toExplicitInputFromUrl(urlQuery, currentProfileNpub, displayIdentifier);
        setQuery(display);
        const backend = ensureAuthorForBackend(urlQuery, currentProfileNpub);
        handleSearch(backend);
        // Normalize URL to implicit form if needed
        const implicit = toImplicitUrlQuery(urlQuery, currentProfileNpub);
        if (implicit !== urlQuery) {
        updateSearchQuery(searchParams, router, implicit);
        }
      }
    } else if (urlQuery) {
      setQuery(urlQuery);
      if (isSlashCommand(urlQuery)) runSlashCommand(urlQuery);
      handleSearch(urlQuery);
    }
  }, [searchParams, handleSearch, manageUrl, pathname, router, runSlashCommand, isSlashCommand, profileScopeUser, profileScopeIdentifiers?.profileIdentifier]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectivePlaceholder = isConnecting ? '/examples' : placeholder;
    const raw = query.trim() || effectivePlaceholder;
    
    // Slash-commands: show CLI-style top card but still run normal search
    if (isSlashCommand(raw)) {
      runSlashCommand(raw);
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

  // Live translation preview (debounced)
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      (async () => {
        try {
          // 1) Apply simple replacements first
          const afterReplacements = await applySimpleReplacements(query);

          // 2) Recursive OR substitution (distribute parentheses)
          const distributed = expandParenthesizedOr(afterReplacements);

          // Helper: resolve all by:<author> tokens within a single query string
          const resolveByTokensInQuery = async (q: string): Promise<string> => {
            const rx = /(^|\s)by:(\S+)/gi;
            let result = '';
            let lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = rx.exec(q)) !== null) {
              const full = m[0];
              const pre = m[1] || '';
              const raw = m[2] || '';
              const match = raw.match(/^([^),.;]+)([),.;]*)$/);
              const core = (match && match[1]) || raw;
              const suffix = (match && match[2]) || '';
              let replacement = core;
              try {
                const npub = await resolveAuthorToNpub(core);
                if (npub) replacement = npub;
              } catch {}
              result += q.slice(lastIndex, m.index);
              result += `${pre}by:${replacement}${suffix}`;
              lastIndex = m.index + full.length;
            }
            result += q.slice(lastIndex);
            return result;
          };

          // 3) Resolve authors inside each distributed branch
          const resolvedDistributed = await Promise.all(distributed.map((q) => resolveByTokensInQuery(q)));

          // Helper: normalize p:<token> where token may be hex, npub or nprofile
          const resolvePTokensInQuery = (q: string): string => {
            const rx = /(^|\s)p:(\S+)/gi;
            let result = '';
            let lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = rx.exec(q)) !== null) {
              const full = m[0];
              const pre = m[1] || '';
              const raw = m[2] || '';
              const match = raw.match(/^([^),.;]+)([),.;]*)$/);
              const core = (match && match[1]) || raw;
              const suffix = (match && match[2]) || '';
              let replacement = core;
              if (/^[0-9a-fA-F]{64}$/.test(core)) {
                try { replacement = nip19.npubEncode(core.toLowerCase()); } catch {}
              } else if (/^npub1[0-9a-z]+$/i.test(core)) {
                replacement = core;
              } else if (/^nprofile1[0-9a-z]+$/i.test(core)) {
                try {
                  const decoded = nip19.decode(core);
                  if (decoded?.type === 'nprofile') {
                    const pk = (decoded.data as { pubkey: string }).pubkey;
                    replacement = nip19.npubEncode(pk);
                  }
                } catch {}
              }
              result += q.slice(lastIndex, m.index);
              result += `${pre}p:${replacement}${suffix}`;
              lastIndex = m.index + full.length;
            }
            result += q.slice(lastIndex);
            return result;
          };

          const withPResolved = resolvedDistributed.map((q) => resolvePTokensInQuery(q));

          // 4) Split into multiple queries if top-level OR exists
          const finalQueriesSet = new Set<string>();
          for (const q of withPResolved) {
            const parts = parseOrQuery(q);
            if (parts.length > 1) {
              parts.forEach((p) => { const s = p.trim(); if (s) finalQueriesSet.add(s); });
            } else {
              const s = q.trim(); if (s) finalQueriesSet.add(s);
            }
          }
          const finalQueries = Array.from(finalQueriesSet);

          // Format compact preview
          const preview = finalQueries.length > 0 ? finalQueries.join('\n') : afterReplacements;
          if (!cancelled) setTranslation(preview);
        } catch {
          if (!cancelled) setTranslation('');
        }
      })();
    }, 120);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

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



  const formatConnectionTooltip = (details: ConnectionStatus | null): string => {
    if (!details) return 'Connection status unknown';
    
    const { connectedRelays, failedRelays } = details;
    const connectedCount = connectedRelays.length;
    const failedCount = failedRelays.length;
    
    let tooltip = '';
    
    
    if (connectedCount > 0) {
      tooltip += `✅ Reachable (WebSocket) ${connectedCount} relay${connectedCount > 1 ? 's' : ''}:\n`;
      connectedRelays.forEach(relay => {
        const shortName = relay.replace(/^wss:\/\//, '').replace(/\/$/, '');
        tooltip += `  • ${shortName}\n`;
      });
    }
    
    if (failedCount > 0) {
      if (connectedCount > 0) tooltip += '\n';
      tooltip += `❌ Unreachable (socket closed) ${failedCount} relay${failedCount > 1 ? 's' : ''}:\n`;
      failedRelays.forEach(relay => {
        const shortName = relay.replace(/^wss:\/\//, '').replace(/\/$/, '');
        tooltip += `  • ${shortName}\n`;
      });
    }
    
    if (connectedCount === 0 && failedCount === 0) {
      tooltip = 'No relay connection information available';
    }
    
    return tooltip.trim();
  };


  // Use the utility function from urlUtils


  const renderContentWithClickableHashtags = useCallback((content: string, options?: { disableNevent?: boolean; skipPointerIds?: Set<string> }) => {
    const strippedContent = stripAllUrls(content, successfulPreviews);
    if (!strippedContent) return null;

    const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
    const nostrTokenRegex = /(nostr:(?:nprofile1|npub1|nevent1|naddr1|note1)[0-9a-z]+)(?!\w)/gi;
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
                const nextQuery = fullUrl;
                setQueryAndUpdateUrl(nextQuery);
                (async () => {
                  setLoading(true);
                  try {
                    const searchResults = await searchEvents(nextQuery, undefined as unknown as number, { exact: true }, undefined, abortControllerRef.current?.signal);
                    setResults(searchResults);
                  } catch (error) {
                    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
                      return;
                    }
                    console.error('Search error:', error);
                    setResults([]);
                  } finally {
                    setLoading(false);
                  }
                })();
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
      const nostrSplit = segment.split(nostrTokenRegex);
      const nostrTokens = segment.match(nostrTokenRegex) || [];
      
      nostrSplit.forEach((textPart, partIndex) => {
        if (textPart) {
          // Process hashtags and emojis in text
          const hashtagSplit = textPart.split(hashtagRegex);
          hashtagSplit.forEach((hashtagPart, hashtagIndex) => {
            if (hashtagPart.startsWith('#')) {
              finalNodes.push(
                <button
                  key={`hashtag-${segIndex}-${partIndex}-${hashtagIndex}`}
                  onClick={() => {
                    const nextQuery = hashtagPart;
                    setQuery(nextQuery);
                    updateUrlForSearch(nextQuery);
                    handleSearch(nextQuery);
                  }}
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
                      onClick={() => {
                        const nextQuery = emojis[emojiIndex] as string;
                        setQueryAndUpdateUrl(nextQuery);
                        handleSearch(nextQuery);
                      }}
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
          
          // Check if we should skip this pointer
          if (options?.skipPointerIds) {
            try {
              const decoded = nip19.decode(token.replace(/^nostr:/i, ''));
              let pointerId = '';
              if (decoded?.type === 'nevent') {
                pointerId = ((decoded.data as { id: string }).id || '').toLowerCase();
              } else if (decoded?.type === 'note') {
                pointerId = (decoded.data as string) || '';
                pointerId = pointerId.toLowerCase();
              }
              if (pointerId && options.skipPointerIds.has(pointerId)) {
                finalNodes.push(token);
                return;
              }
            } catch {}
          }
          
          if (options?.disableNevent && /^nostr:(?:nevent1|naddr1|note1)/i.test(token)) {
            finalNodes.push(token);
          } else {
            finalNodes.push(
              <InlineNostrToken
                key={`nostr-${segIndex}-${partIndex}`}
                token={token}
                onProfileClick={goToProfile}
                onSearch={(query) => {
                  setQueryAndUpdateUrl(query);
                  handleSearch(query);
                }}
                renderContentWithClickableHashtags={renderContentWithClickableHashtags}
              />
            );
          }
        }
      });
    });

    return finalNodes;
  }, [successfulPreviews, setQuery, handleSearch, setLoading, setResults, abortControllerRef, goToProfile, setQueryAndUpdateUrl, updateUrlForSearch]);

  const getReplyToEventId = useCallback((event: NDKEvent): string | null => {
    try {
      const eTags = (event.tags || []).filter((t) => t && t[0] === 'e');
      if (eTags.length === 0) return null;
      const replyTag = eTags.find((t) => t[3] === 'reply') || eTags.find((t) => t[3] === 'root') || eTags[eTags.length - 1];
      return replyTag && replyTag[1] ? replyTag[1] : null;
    } catch {
      return null;
    }
  }, []);

  // toPlainEvent moved to shared util; RawEventJson will use it.


  const renderNoteMedia = useCallback((content: string) => (
    <NoteMedia
      content={content}
      onSearch={(query) => {
        setQueryAndUpdateUrl(query);
        (async () => {
          setLoading(true);
          try {
            const searchResults = await searchEvents(query, undefined as unknown as number, { exact: true }, undefined, abortControllerRef.current?.signal);
            setResults(searchResults);
          } catch (error) {
            if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
              return;
            }
            console.error('Search error:', error);
            setResults([]);
          } finally {
            setLoading(false);
          }
        })();
      }}
      onUrlLoaded={(loadedUrl) => {
        setSuccessfulPreviews((prev) => {
          if (prev.has(loadedUrl)) return prev;
          const next = new Set(prev);
          next.add(loadedUrl);
          return next;
        });
      }}
    />
  ), [setQueryAndUpdateUrl, setLoading, setResults, abortControllerRef]);

  const handleParentToggle = useCallback((parentId: string, parent: NDKEvent | 'loading' | null) => {
    if (parent === null) {
      const updated = { ...expandedParents };
      delete updated[parentId];
      setExpandedParents(updated);
    } else {
      setExpandedParents((prev) => ({ ...prev, [parentId]: parent }));
    }
  }, [expandedParents, setExpandedParents]);

  const renderParentChain = useCallback((childEvent: NDKEvent, isTop: boolean = true): React.ReactNode => {
    return (
      <ParentChain
        childEvent={childEvent}
        isTop={isTop}
        expandedParents={expandedParents}
        onParentToggle={handleParentToggle}
        onAuthorClick={goToProfile}
        renderContentWithClickableHashtags={renderContentWithClickableHashtags}
        renderNoteMedia={renderNoteMedia}
      />
    );
  }, [expandedParents, handleParentToggle, goToProfile, renderContentWithClickableHashtags, renderNoteMedia]);

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

  const handleExampleNext = useCallback(() => {
    setPlaceholder(nextExample());
    setRotationProgress(0);
    setRotationSeed((s) => s + 1);
  }, []);

  return (
    <div className="w-full pt-4">
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
          query={query}
          placeholder={placeholder}
          loading={loading}
          resolvingAuthor={resolvingAuthor}
          showExternalButton={showExternalButton}
          avatarOverlap={avatarOverlap}
          profileScopeUser={profileScopeUser}
          onInputChange={handleInputChange}
          onClear={handleClear}
          onOpenExternal={handleOpenExternal}
          onSubmit={handleSubmit}
          onExampleNext={handleExampleNext}
          rotationProgress={rotationProgress}
        />
      </div>
      
      <QueryTranslation translation={translation} />

      {/* Command output will be injected as first result card below */}

      {/* Collapsed state - always in same row */}
      {(loading || results.length > 0) && (
        <div className="w-full">
          {/* Button row - always collapsed states */}
          <div className="flex items-center justify-end gap-3">
            <RelayCollapsed
              connectionStatus={connectionStatus}
              connectedCount={calculateRelayCounts(connectionDetails, recentlyActive).eventsReceivedCount}
              totalCount={calculateRelayCounts(connectionDetails, recentlyActive).totalCount}
              onExpand={() => setShowConnectionDetails(!showConnectionDetails)}
              formatConnectionTooltip={formatConnectionTooltip}
              connectionDetails={connectionDetails}
              isExpanded={showConnectionDetails}
            />

            <FilterCollapsed
              filtersAreActive={filterSettings.filterMode !== 'never' && (filterSettings.filterMode === 'always' || (filterSettings.filterMode === 'intelligently' && results.length >= SEARCH_FILTER_THRESHOLD))}
              hasActiveFilters={filterSettings.maxEmojis !== null || filterSettings.maxHashtags !== null || filterSettings.maxMentions !== null || filterSettings.hideLinks || filterSettings.hideBridged || filterSettings.hideBots || filterSettings.hideNsfw || filterSettings.verifiedOnly || (filterSettings.fuzzyEnabled && (filterSettings.resultFilter || '').trim().length > 0)}
              filteredCount={fuseFilteredResults.length}
              resultCount={results.length}
              onExpand={() => setShowFilterDetails(!showFilterDetails)}
              isExpanded={showFilterDetails}
            />
          </div>

          {/* Expanded views - below button row, full width */}
          {showConnectionDetails && connectionDetails && (
            <RelayStatusDisplay 
              connectionDetails={connectionDetails}
              recentlyActive={recentlyActive}
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
                      {topExamples.map((ex) => (
                        <div key={ex}>
                          <button
                            type="button"
                            className="text-left w-full hover:underline"
                            onClick={() => {
                              setQueryAndUpdateUrl(ex);
                              handleSearch(ex);
                            }}
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
            {finalResults.map((event, idx) => {
              const parentId = getReplyToEventId(event);
              const parent = parentId ? expandedParents[parentId] : undefined;
              const isLoadingParent = parent === 'loading';
              const parentEvent = parent && parent !== 'loading' ? (parent as NDKEvent) : null;
              const hasCollapsedBar = Boolean(parentId && !parentEvent && !isLoadingParent);
              const hasExpandedParent = Boolean(parentEvent);
              const noteCardClasses = `relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] ${hasCollapsedBar || hasExpandedParent ? 'rounded-b-lg rounded-t-none border-t-0' : 'rounded-lg'}`;
              const key = `${event.id || 'unknown'}:${idx}`;
              return (
                <div key={key}>
                  {parentId && renderParentChain(event)}
                  {event.kind === 0 ? (
                    <ProfileCard event={event} onAuthorClick={(npub) => goToProfile(npub, event)} showBanner={false} />
                  ) : event.kind === 1 ? (
                    <EventCard
                      event={event}
                      onAuthorClick={goToProfile}
                      renderContent={(text) => (
                        <TruncatedText 
                          content={text} 
                          maxLength={TEXT_MAX_LENGTH}
                          className="text-gray-100 whitespace-pre-wrap break-words"
                          renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { skipPointerIds: new Set([event.id?.toLowerCase?.() || '']) })}
                        />
                      )}
                      mediaRenderer={renderNoteMedia}
                      footerRight={(
                        <button
                          type="button"
                          className="text-xs hover:underline"
                          title="Search this nevent"
                          onClick={() => {
                            try {
                              const nevent = nip19.neventEncode({ id: event.id });
                              const q = nevent;
                              setQuery(q);
                              updateUrlForSearch(q);
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {formatEventTimestamp(event)}
                        </button>
                      )}
                      className={noteCardClasses}
                    />
                  ) : event.kind === 20 ? (
                    <EventCard
                      event={event}
                      onAuthorClick={goToProfile}
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
                                    onClickSearch={() => {
                                      const nextQuery = hash ? hash : getFilenameFromUrl(src);
                                      setQuery(nextQuery);
                                      if (manageUrl) {
                                        updateUrlForSearch(nextQuery);
                                      }
                                      (async () => {
                                        setLoading(true);
                                        try {
                                          const searchResults = await searchEvents(nextQuery, undefined as unknown as number, { exact: true }, undefined, abortControllerRef.current?.signal);
                                          setResults(searchResults);
                                        } catch (error) {
                                          if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
                                            return;
                                          }
                                          console.error('Search error:', error);
                                          setResults([]);
                                        } finally {
                                          setLoading(false);
                                        }
                                      })();
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                      footerRight={(
                        <button
                          type="button"
                          className="text-xs hover:underline"
                          title="Search this nevent"
                          onClick={() => {
                            try {
                              const nevent = nip19.neventEncode({ id: event.id });
                              const q = nevent;
                              setQuery(q);
                              updateUrlForSearch(q);
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {formatEventTimestamp(event)}
                        </button>
                      )}
                      className={noteCardClasses}
                    />
                  ) : event.kind === 21 || event.kind === 22 ? (
                    <EventCard
                      event={event}
                      onAuthorClick={goToProfile}
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
                                    onClickSearch={() => {
                                      const nextQuery = hash ? hash : getFilenameFromUrl(src);
                                      setQuery(nextQuery);
                                      if (manageUrl) {
                                        updateUrlForSearch(nextQuery);
                                      }
                                      (async () => {
                                        setLoading(true);
                                        try {
                                          const searchResults = await searchEvents(nextQuery, undefined as unknown as number, { exact: true }, undefined, abortControllerRef.current?.signal);
                                          setResults(searchResults);
                                        } catch (error) {
                                          if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
                                            return;
                                          }
                                          console.error('Search error:', error);
                                          setResults([]);
                                        } finally {
                                          setLoading(false);
                                        }
                                      })();
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                      footerRight={(
                        <button
                          type="button"
                          className="text-xs hover:underline"
                          title="Search this nevent"
                          onClick={() => {
                            try {
                              const nevent = nip19.neventEncode({ id: event.id });
                              const q = nevent;
                              setQuery(q);
                              updateUrlForSearch(q);
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {formatEventTimestamp(event)}
                        </button>
                      )}
                      className={noteCardClasses}
                    />
                  ) : event.kind === HIGHLIGHTS_KIND ? (
                    <EventCard
                      event={event}
                      onAuthorClick={goToProfile}
                      renderContent={(text) => (
                        <TruncatedText 
                          content={text} 
                          maxLength={TEXT_MAX_LENGTH}
                          className="text-gray-100 whitespace-pre-wrap break-words"
                          renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { skipPointerIds: new Set([event.id?.toLowerCase?.() || '']) })}
                        />
                      )}
                      mediaRenderer={renderNoteMedia}
                      footerRight={(
                        <button
                          type="button"
                          className="text-xs hover:underline"
                          title="Search this nevent"
                          onClick={() => {
                            try {
                              const nevent = nip19.neventEncode({ id: event.id });
                              const q = nevent;
                              setQuery(q);
                              updateUrlForSearch(q);
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {formatEventTimestamp(event)}
                        </button>
                      )}
                      className={noteCardClasses}
                    />
                  ) : (
                    <EventCard
                      event={event}
                      onAuthorClick={goToProfile}
                      renderContent={() => (
                        <RawEventJson event={event} />
                      )}
                      className={noteCardClasses}
                      footerRight={(
                        <button
                          type="button"
                          className="text-xs hover:underline"
                          title="Search this nevent"
                          onClick={() => {
                            try {
                              const nevent = nip19.neventEncode({ id: event.id });
                              const q = nevent;
                              setQuery(q);
                              updateUrlForSearch(q);
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {formatEventTimestamp(event)}
                        </button>
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      }, [fuseFilteredResults, expandedParents, manageUrl, goToProfile, handleSearch, renderContentWithClickableHashtags, renderNoteMedia, renderParentChain, getReplyToEventId, topCommandText, topExamples, setQueryAndUpdateUrl, updateUrlForSearch])}
    </div>
  );
}


