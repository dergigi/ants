'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { connect, getCurrentExample, nextExample, ndk, ConnectionStatus, addConnectionStatusListener, removeConnectionStatusListener, getRecentlyActiveRelays, safeSubscribe } from '@/lib/ndk';
import { resolveAuthorToNpub } from '@/lib/vertex';
import { NDKEvent, NDKRelaySet, NDKUser } from '@nostr-dev-kit/ndk';
import { searchEvents, expandParenthesizedOr, parseOrQuery } from '@/lib/search';
import { applySimpleReplacements } from '@/lib/search/replacements';
import { applyContentFilters } from '@/lib/contentAnalysis';
import { URL_REGEX, IMAGE_EXT_REGEX, VIDEO_EXT_REGEX, isAbsoluteHttpUrl } from '@/lib/urlPatterns';
import { extractImetaImageUrls, extractImetaVideoUrls, extractImetaBlurhashes } from '@/lib/picture';
import { Blurhash } from 'react-blurhash';
// Use unified cached NIP-05 checker for DRYness and to leverage persistent cache
import { checkNip05 as verifyNip05Async } from '@/lib/vertex';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getCurrentProfileNpub, toImplicitUrlQuery, toExplicitInputFromUrl, ensureAuthorForBackend, decodeUrlQuery } from '@/lib/search/queryTransforms';
import Image from 'next/image';
import EventCard from '@/components/EventCard';
import UrlPreview from '@/components/UrlPreview';
import ProfileCard from '@/components/ProfileCard';
import ClientFilters, { FilterSettings } from '@/components/ClientFilters';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import emojiRegex from 'emoji-regex';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
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
};

// (Local AuthorBadge removed; using global `components/AuthorBadge` inside EventCard.)

export default function SearchView({ initialQuery = '', manageUrl = true }: Props) {
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
  const [placeholder, setPlaceholder] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'timeout'>('connecting');
  const [connectionDetails, setConnectionDetails] = useState<ConnectionStatus | null>(null);
  const [loadingDots, setLoadingDots] = useState('...');
  const currentSearchId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [expandedParents, setExpandedParents] = useState<Record<string, NDKEvent | 'loading'>>({});
  const [avatarOverlap, setAvatarOverlap] = useState(false);
  const searchRowRef = useRef<HTMLFormElement | null>(null);
  // Removed expanded-term chip UI and related state to simplify UX
  const [rotationProgress, setRotationProgress] = useState(0);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [recentlyActive, setRecentlyActive] = useState<string[]>([]);
  const [successfulPreviews, setSuccessfulPreviews] = useState<Set<string>>(new Set());
  const [translation, setTranslation] = useState<string>('');
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({ maxEmojis: 3, maxHashtags: 3, hideLinks: false, resultFilter: '', verifiedOnly: false, fuzzyEnabled: true, hideBots: false, hideNsfw: false });
  const [topCommandText, setTopCommandText] = useState<string | null>(null);
  const [topExamples, setTopExamples] = useState<string[] | null>(null);
  const isSlashCommand = useCallback((input: string): boolean => /^\s*\//.test(input), []);
  const buildCli = useCallback((label: string, body: string | string[] = ''): string => {
    const lines = Array.isArray(body) ? body : [body];
    return [`$ ants ${label}`, '', ...lines].join('\n');
  }, []);
  const runSlashCommand = useCallback((rawInput: string) => {
    const cmd = rawInput.replace(/^\s*\//, '').trim().toLowerCase();
    if (cmd === 'help') {
      const lines = ['Available commands:', ...SLASH_COMMANDS.map(c => `  ${c.label.padEnd(12)} ${c.description}`)];
      setTopCommandText(buildCli('--help', lines));
      setTopExamples(null);
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

  // Simple input change handler: update local query state; searches run on submit
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, [setQuery]);

  // Memoized client-side filtered results (for count and rendering)
  // Maintain a map of pubkey->verified to avoid re-verifying
  const verifiedMapRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    // Proactively verify missing entries (bounded to first 50) and then reorder results
    const toVerify: Array<{ pubkey: string; nip05: string }> = [];
    for (const evt of results.slice(0, 50)) {
      const pubkey = (evt.pubkey || evt.author?.pubkey) as string | undefined;
      const nip05 = (evt.author?.profile as { nip05?: string } | undefined)?.nip05;
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


  const filteredResults = useMemo(
    () => applyContentFilters(
      results,
      filterSettings.maxEmojis,
      filterSettings.maxHashtags,
      filterSettings.hideLinks,
      filterSettings.verifiedOnly,
      (pubkey) => Boolean(pubkey && verifiedMapRef.current.get(pubkey) === true),
      filterSettings.hideBots,
      filterSettings.hideNsfw
    ),
    [results, filterSettings.maxEmojis, filterSettings.maxHashtags, filterSettings.hideLinks, filterSettings.verifiedOnly, filterSettings.hideBots, filterSettings.hideNsfw]
  );

  // Apply optional fuzzy filter on top of client-side filters
  const fuseFilteredResults = useMemo(() => {
    const q = (filterSettings.fuzzyEnabled ? (filterSettings.resultFilter || '') : '').trim();
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
  }, [filteredResults, filterSettings.resultFilter, filterSettings.fuzzyEnabled]);

  function applyClientFilters(events: NDKEvent[], terms: string[], active: Set<string>): NDKEvent[] {
    // Rely solely on replacements.txt expansion upstream; no client-side media seeding
    return events;
  }

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setResolvingAuthor(false);
      return;
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
      const searchResults = await searchEvents(expanded, 200, undefined, undefined, abortController.signal);
      
      // Check if search was aborted after getting results
      if (abortController.signal.aborted || currentSearchId.current !== searchId) {
        return;
      }

      const filtered = applyClientFilters(searchResults, [], new Set<string>());
      setResults(filtered);
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
  }, [pathname, router, isSlashCommand]);

  useEffect(() => {
    if (!isConnecting) return;
    const id = setInterval(() => {
      setLoadingDots((prev) => (prev === '...' ? '.' : prev === '.' ? '..' : '...'));
    }, 21);
    return () => clearInterval(id);
  }, [isConnecting]);

  useEffect(() => {
    const initializeNDK = async () => {
      setIsConnecting(true);
      setConnectionStatus('connecting');
      const connectionResult = await connect(8000); // 8 second timeout for more reliable initial connect
      setPlaceholder(getCurrentExample());
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
  }, [query, loading]);

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
        const display = toExplicitInputFromUrl(urlQuery, currentProfileNpub);
        setQuery(display);
        const backend = ensureAuthorForBackend(urlQuery, currentProfileNpub);
        handleSearch(backend);
        // Normalize URL to implicit form if needed
        const implicit = toImplicitUrlQuery(urlQuery, currentProfileNpub);
        if (implicit !== urlQuery) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('q', implicit);
          router.replace(`?${params.toString()}`);
        }
      }
    } else if (urlQuery) {
      setQuery(urlQuery);
      if (isSlashCommand(urlQuery)) runSlashCommand(urlQuery);
      handleSearch(urlQuery);
    }
  }, [searchParams, handleSearch, manageUrl, pathname, router, runSlashCommand, isSlashCommand]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = query.trim() || placeholder;
    
    // Slash-commands: show CLI-style top card but still run normal search
    if (isSlashCommand(raw)) {
      runSlashCommand(raw);
      setQuery(raw);
      if (manageUrl) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('q', raw);
        router.replace(`?${params.toString()}`);
      }
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
    // Keep input explicit; on /p add missing by:<current npub> to the input value on submit
    let displayVal = raw;
    if (currentProfileNpub && !/(^|\s)by:\S+(?=\s|$)/i.test(displayVal)) {
      displayVal = `${displayVal} by:${currentProfileNpub}`.trim();
    }
    setQuery(displayVal);
    if (manageUrl) {
      const params = new URLSearchParams(searchParams.toString());
      if (displayVal) {
        // URL should be implicit on profile pages: strip matching by:npub
        const urlValue = currentProfileNpub ? toImplicitUrlQuery(displayVal, currentProfileNpub) : displayVal;
        params.set('q', urlValue);
        router.replace(`?${params.toString()}`);
        // Backend search should include implicit author on profile pages
        const backend = ensureAuthorForBackend(displayVal, currentProfileNpub);
        handleSearch(backend.trim());
      } else {
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

          // 4) Split into multiple queries if top-level OR exists
          const finalQueriesSet = new Set<string>();
          for (const q of resolvedDistributed) {
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

  const goToProfile = useCallback((npub: string) => {
    router.push(`/p/${npub}`);
  }, [router]);

  const formatDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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

  const extractImageUrls = useCallback((text: string): string[] => {
    if (!text) return [];
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = URL_REGEX.exec(text)) !== null) {
      const url = (m[1] || '').replace(/[),.;]+$/, '').trim();
      if (IMAGE_EXT_REGEX.test(url) && !matches.includes(url)) matches.push(url);
    }
    return matches.slice(0, 3);
  }, []);

  const extractVideoUrls = useCallback((text: string): string[] => {
    if (!text) return [];
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = URL_REGEX.exec(text)) !== null) {
      const url = (m[1] || '').replace(/[),.;]+$/, '').trim();
      if (VIDEO_EXT_REGEX.test(url) && !matches.includes(url)) matches.push(url);
    }
    return matches.slice(0, 2);
  }, []);

  const extractNonMediaUrls = (text: string): string[] => {
    if (!text) return [];
    const urls: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = URL_REGEX.exec(text)) !== null) {
      const raw = (m[1] || '').replace(/[),.;]+$/, '').trim();
      if (!IMAGE_EXT_REGEX.test(raw) && !VIDEO_EXT_REGEX.test(raw) && !urls.includes(raw)) {
        urls.push(raw);
      }
    }
    return urls.slice(0, 2);
  };

  const getFilenameFromUrl = (url: string): string => {
    try {
      const u = new URL(url);
      const pathname = u.pathname || '';
      const last = pathname.split('/').filter(Boolean).pop() || '';
      return last;
    } catch {
      // Fallback for invalid URLs in content
      const cleaned = url.split(/[?#]/)[0];
      const parts = cleaned.split('/');
      return parts[parts.length - 1] || url;
    }
  };

  const stripMediaUrls = useCallback((text: string): string => {
    if (!text) return '';
    const cleaned = text
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg))(?:[?#][^\s]*)?/gi, '')
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:mp4|webm|ogg|ogv|mov|m4v))(?:[?#][^\s]*)?/gi, '')
      .replace(/\?[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '')
      .replace(/\?name=[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '');
    return cleaned.replace(/\s{2,}/g, ' ').trim();
  }, []);

  const stripPreviewUrls = useCallback((text: string): string => {
    if (!text) return '';
    let cleaned = text;
    successfulPreviews.forEach(url => {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedUrl.replace(/[),.;]+$/, ''), 'gi');
      cleaned = cleaned.replace(regex, '');
    });
    return cleaned.replace(/\s{2,}/g, ' ').trim();
  }, [successfulPreviews]);

  const renderContentWithClickableHashtags = useCallback((content: string, options?: { disableNevent?: boolean }) => {
    const strippedContent = stripPreviewUrls(stripMediaUrls(content));
    if (!strippedContent) return null;

    const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
    const nostrIdentityRegex = /(nostr:(?:nprofile1|npub1)[0-9a-z]+)(?!\w)/gi;
    const nostrEventRegex = /(nostr:nevent1[0-9a-z]+)(?!\w)/gi;

    const splitByUrls = strippedContent.split(urlRegex);
    const finalNodes: (string | React.ReactNode)[] = [];

    splitByUrls.forEach((segment, segIndex) => {
      const isUrl = /^https?:\/\//i.test(segment);
      if (isUrl) {
        const cleanedUrl = segment.replace(/[),.;]+$/, '').trim();
        finalNodes.push(
          <span key={`url-${segIndex}`} className="inline-flex items-center gap-1">
            <a
              href={cleanedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 hover:underline break-all"
              onClick={(e) => { e.stopPropagation(); }}
              title={cleanedUrl}
            >
              {cleanedUrl}
            </a>
            <button
              type="button"
              title="Search for this URL"
              className="p-0.5 text-gray-400 hover:text-gray-200 opacity-70"
              onClick={() => {
                const nextQuery = cleanedUrl;
                setQuery(nextQuery);
                if (manageUrl) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('q', nextQuery);
                  router.replace(`?${params.toString()}`);
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
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs" />
            </button>
          </span>
        );
        return;
      }

      // For non-URL text, process inline nprofile/npub tokens first, then nevent (unless disabled), then hashtags and emojis
      const nprofileSplit = segment.split(nostrIdentityRegex);

      // Inline component to resolve nprofile to a username
      function InlineNprofile({ token }: { token: string }) {
        const [label, setLabel] = useState<string>('');
        const [npub, setNpub] = useState<string>('');

        useEffect(() => {
          let isMounted = true;
          (async () => {
            try {
              const m = token.match(/^(nostr:nprofile1[0-9a-z]+)([),.;]*)$/i);
              const core = (m ? m[1] : token).replace(/^nostr:/i, '');
              const { type, data } = nip19.decode(core);
              let pubkey: string | undefined;
              if (type === 'nprofile') pubkey = (data as { pubkey: string }).pubkey;
              else if (type === 'npub') pubkey = data as string;
              else return;
              const user = new NDKUser({ pubkey });
              user.ndk = ndk;
              try { await user.fetchProfile(); } catch {}
              if (!isMounted) return;
              type UserProfileLike = { display?: string; displayName?: string; name?: string } | undefined;
              const profile = user.profile as UserProfileLike;
              const display = profile?.displayName || profile?.display || profile?.name || '';
              const npubVal = nip19.npubEncode(pubkey);
              setNpub(npubVal);
              setLabel(display || `npub:${npubVal.slice(0, 8)}…${npubVal.slice(-4)}`);
            } catch {
              if (!isMounted) return;
              setLabel(token);
            }
          })();
          return () => { isMounted = false; };
        }, [token]);

        return (
          <button
            type="button"
            className="text-blue-400 hover:text-blue-300 hover:underline inline"
            title={token}
            onClick={() => {
              if (!npub) return;
              goToProfile(npub);
            }}
          >
            {label || token}
          </button>
        );
      }

      // Inline component to render an embedded/quoted nevent
      function InlineNevent({ token }: { token: string }) {
        const [embedded, setEmbedded] = useState<NDKEvent | null>(null);
        const [loading, setLoading] = useState<boolean>(true);
        const [error, setError] = useState<string | null>(null);

        useEffect(() => {
          let isMounted = true;
          (async () => {
            try {
              const m = token.match(/^(nostr:nevent1[0-9a-z]+)([),.;]*)$/i);
              const core = (m ? m[1] : token).replace(/^nostr:/i, '');
              const decoded = nip19.decode(core);
              if (decoded?.type !== 'nevent') {
                throw new Error('Not nevent');
              }
              const data = decoded.data as { id: string; relays?: string[] };
              const id = data.id;
              const relays = Array.isArray(data.relays) ? data.relays.filter((r) => typeof r === 'string') : [];
              // Prefer hinted relays if present
              let found: NDKEvent | null = null;
              if (relays.length > 0) {
                try {
                  const relaySet = NDKRelaySet.fromRelayUrls(
                    Array.from(new Set(relays.map((r) => /^wss?:\/\//i.test(r) ? r : `wss://${r}`))),
                    ndk
                  );
                  await new Promise<void>((resolve) => {
                    const sub = safeSubscribe([{ ids: [id] }], { closeOnEose: true, relaySet });
                    if (!sub) {
                      resolve();
                      return;
                    }
                    const timer = setTimeout(() => { try { sub.stop(); } catch {}; resolve(); }, 5000);
                    sub.on('event', (evt: NDKEvent) => { found = evt; });
                    sub.on('eose', () => { clearTimeout(timer); try { sub.stop(); } catch {}; resolve(); });
                    sub.start();
                  });
                } catch {}
              }
              // Fallback: try without relay hints if not found
              if (!found) {
                await new Promise<void>((resolve) => {
                  const sub = safeSubscribe([{ ids: [id] }], { closeOnEose: true });
                  if (!sub) {
                    resolve();
                    return;
                  }
                  const timer = setTimeout(() => { try { sub.stop(); } catch {}; resolve(); }, 8000);
                  sub.on('event', (evt: NDKEvent) => { found = evt; });
                  sub.on('eose', () => { clearTimeout(timer); try { sub.stop(); } catch {}; resolve(); });
                  sub.start();
                });
              }

              if (!isMounted) return;
              if (found) {
                setEmbedded(found);
              } else {
                setError('Not found');
              }
            } catch {
              if (!isMounted) return;
              setError('Invalid nevent');
            } finally {
              if (isMounted) setLoading(false);
            }
          })();
          return () => { isMounted = false; };
        }, [token]);

        if (loading) {
          return (
            <span className="inline-block align-middle text-gray-400 bg-[#262626] border border-[#3d3d3d] rounded px-2 py-1">Loading note...</span>
          );
        }
        if (error || !embedded) {
          return (
            <span className="inline-block align-middle text-gray-400 bg-[#262626] border border-[#3d3d3d] rounded px-2 py-1" title={token}>Quoted note unavailable</span>
          );
        }

        return (
          <div className="w-full">
            <EventCard
              event={embedded}
              onAuthorClick={goToProfile}
              renderContent={(text) => (
                <div className="text-gray-100 whitespace-pre-wrap break-words">
                  {renderContentWithClickableHashtags(text, { disableNevent: true })}
                </div>
              )}
              variant="inline"
              footerRight={embedded.created_at ? (
                <button
                  type="button"
                  className="text-xs hover:underline opacity-80"
                  title="Search this nevent"
                  onClick={() => {
                    try {
                      const nevent = nip19.neventEncode({ id: embedded.id });
                      const q = nevent;
                      setQuery(q);
                      if (manageUrl) {
                        const params = new URLSearchParams(searchParams.toString());
                        params.set('q', q);
                        router.replace(`?${params.toString()}`);
                      }
                      handleSearch(q);
                    } catch {}
                  }}
                >
                  {new Date(embedded.created_at * 1000).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </button>
              ) : null}
            />
          </div>
        );
      }

      nprofileSplit.forEach((chunk, chunkIdx) => {
        const isNostrIdentityToken = /^nostr:(?:nprofile1|npub1)[0-9a-z]+[),.;]*$/i.test(chunk);
        if (isNostrIdentityToken) {
          const m = chunk.match(/^(nostr:(?:nprofile1|npub1)[0-9a-z]+)([),.;]*)$/i);
          const coreToken = m ? m[1] : chunk;
          const trailing = (m && m[2]) || '';
          finalNodes.push(
            <span key={`nprofile-${segIndex}-${chunkIdx}`} className="inline">
              <InlineNprofile token={coreToken} />
              {trailing}
            </span>
          );
          return;
        }

        // Now split this chunk for nevent tokens if enabled
        const neventSplit = (options?.disableNevent ? [chunk] : chunk.split(nostrEventRegex));
        neventSplit.forEach((sub, subIdx) => {
          const isNostrEventToken = /^nostr:nevent1[0-9a-z]+[),.;]*$/i.test(sub);
          if (!options?.disableNevent && isNostrEventToken) {
            const m2 = sub.match(/^(nostr:nevent1[0-9a-z]+)([),.;]*)$/i);
            const coreToken2 = m2 ? m2[1] : sub;
            const trailing2 = (m2 && m2[2]) || '';
            finalNodes.push(
              <div key={`nevent-${segIndex}-${chunkIdx}-${subIdx}`} className="my-2 w-full">
                <InlineNevent token={coreToken2} />
              </div>
            );
            if (trailing2) finalNodes.push(trailing2);
            return;
          }

          // Process hashtags and emojis within the remaining non-nevent text
          const parts = sub.split(/(#\w+)/g);
          parts.forEach((part, index) => {
            if (part.startsWith('#')) {
              finalNodes.push(
                <button
                  key={`hashtag-${segIndex}-${chunkIdx}-${subIdx}-${index}`}
                  onClick={() => {
                    const nextQuery = part;
                    setQuery(nextQuery);
                    if (manageUrl) {
                      const params = new URLSearchParams(searchParams.toString());
                      params.set('q', nextQuery);
                      router.replace(`?${params.toString()}`);
                    }
                    handleSearch(nextQuery);
                  }}
                  className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                >
                  {part}
                </button>
              );
            } else if (part && part.trim()) {
              const emojiRx = emojiRegex();
              const emojiParts = part.split(emojiRx);
              const emojis = part.match(emojiRx) || [];
              for (let i = 0; i < emojiParts.length; i++) {
                if (emojiParts[i]) finalNodes.push(emojiParts[i]);
                if (emojis[i]) {
                  finalNodes.push(
                    <button
                      key={`emoji-${segIndex}-${chunkIdx}-${subIdx}-${index}-${i}`}
                      onClick={() => {
                        const nextQuery = emojis[i] as string;
                        setQuery(nextQuery);
                        if (manageUrl) {
                          const params = new URLSearchParams(searchParams.toString());
                          params.set('q', nextQuery);
                          router.replace(`?${params.toString()}`);
                        }
                        handleSearch(nextQuery);
                      }}
                      className="text-yellow-400 hover:text-yellow-300 hover:scale-110 transition-transform cursor-pointer"
                    >
                      {emojis[i]}
                    </button>
                  );
                }
              }
            } else {
              finalNodes.push(part);
            }
          });
        });
      });
    });

    return finalNodes;
  }, [stripPreviewUrls, stripMediaUrls, setQuery, manageUrl, searchParams, router, handleSearch, setLoading, setResults, abortControllerRef, goToProfile]);

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

  const fetchEventById = useCallback(async (eventId: string): Promise<NDKEvent | null> => {
    try { await connect(); } catch {}
    return new Promise<NDKEvent | null>((resolve) => {
      let found: NDKEvent | null = null;
      const sub = safeSubscribe([{ ids: [eventId] }], { closeOnEose: true });
      if (!sub) {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => { try { sub.stop(); } catch {}; resolve(found); }, 8000);
      sub.on('event', (evt: NDKEvent) => { found = evt; });
      sub.on('eose', () => { clearTimeout(timer); try { sub.stop(); } catch {}; resolve(found); });
      sub.start();
    });
  }, []);

  const renderNoteMedia = useCallback((content: string) => (
    <>
      {extractImageUrls(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractImageUrls(content).map((src) => (
            <button
              key={src}
              type="button"
              title={getFilenameFromUrl(src)}
              className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f] text-left cursor-pointer"
              onClick={() => {
                const filename = getFilenameFromUrl(src);
                const nextQuery = filename;
                setQuery(filename);
                if (manageUrl) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('q', filename);
                  router.replace(`?${params.toString()}`);
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
            >
              {isAbsoluteHttpUrl(src) ? (
                <Image src={src} alt="linked media" width={1024} height={1024} className="h-auto w-full object-contain" unoptimized />
              ) : null}
            </button>
          ))}
        </div>
      )}
      {extractVideoUrls(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractVideoUrls(content).map((src) => (
            <div key={src} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
              <video controls playsInline className="w-full h-auto">
                <source src={src} />
                Your browser does not support the video tag.
              </video>
            </div>
          ))}
        </div>
      )}
      {extractNonMediaUrls(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractNonMediaUrls(content).map((u) => (
            <UrlPreview
              key={u}
              url={u}
              onLoaded={(loadedUrl) => {
                setSuccessfulPreviews((prev) => {
                  if (prev.has(loadedUrl)) return prev;
                  const next = new Set(prev);
                  next.add(loadedUrl);
                  return next;
                });
              }}
              onSearch={(targetUrl) => {
                const nextQuery = targetUrl;
                setQuery(nextQuery);
                if (manageUrl) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('q', nextQuery);
                  router.replace(`?${params.toString()}`);
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
          ))}
        </div>
      )}
    </>
  ), [extractImageUrls, extractVideoUrls, setQuery, manageUrl, searchParams, router]);

  const renderParentChain = useCallback((childEvent: NDKEvent, isTop: boolean = true): React.ReactNode => {
    const parentId = getReplyToEventId(childEvent);
    if (!parentId) return null;
    const parentState = expandedParents[parentId];
    const isLoading = parentState === 'loading';
    const parentEvent = parentState && parentState !== 'loading' ? (parentState as NDKEvent) : null;

    const handleToggle = async () => {
      if (expandedParents[parentId]) {
        const updated = { ...expandedParents };
        delete updated[parentId];
        setExpandedParents(updated);
        return;
      }
      setExpandedParents((prev) => ({ ...prev, [parentId]: 'loading' }));
      const fetched = await fetchEventById(parentId);
      setExpandedParents((prev) => ({ ...prev, [parentId]: fetched || 'loading' }));
    };

    if (!parentEvent) {
      const barClasses = `text-xs text-gray-300 bg-[#1f1f1f] border border-[#3d3d3d] px-4 py-2 hover:bg-[#262626] ${
        isTop ? 'rounded-t-lg' : 'rounded-none border-t-0'
      } rounded-b-none border-b-0`;
      return (
        <div className={barClasses}>
          <button type="button" onClick={handleToggle} className="w-full text-left">
            {isLoading ? 'Loading parent…' : `Replying to: ${nip19.neventEncode({ id: parentId })}`}
          </button>
        </div>
      );
    }

    return (
      <>
        {renderParentChain(parentEvent, isTop)}
        <div className={`${isTop ? 'rounded-t-lg' : 'rounded-none border-t-0'} rounded-b-none border-b-0 p-4 bg-[#2d2d2d] border border-[#3d3d3d]`}>
          <EventCard
            event={parentEvent}
            onAuthorClick={goToProfile}
            renderContent={(text) => (
              <div className="text-gray-100 whitespace-pre-wrap break-words">{renderContentWithClickableHashtags(text)}</div>
            )}
            mediaRenderer={renderNoteMedia}
            className="p-0 border-0 bg-transparent"
          />
        </div>
      </>
    );
  }, [getReplyToEventId, expandedParents, setExpandedParents, fetchEventById, renderNoteMedia, goToProfile, renderContentWithClickableHashtags]);

  return (
    <div className={`w-full ${(results.length > 0 || topCommandText) ? 'pt-4' : 'min-h-screen flex items-center'}`}>
      <form ref={searchRowRef} onSubmit={handleSubmit} className={`w-full ${avatarOverlap ? 'pr-16' : ''}`} id="search-row">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              placeholder={isConnecting ? loadingDots : placeholder}
              className="w-full px-4 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] text-gray-100 placeholder-gray-400"
              style={{ paddingRight: '3rem' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
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
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            {!query && !loading && (
              <button
                type="button"
                aria-label="Next example"
                title="Show next example"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 cursor-pointer"
                onClick={() => { setPlaceholder(nextExample()); setRotationProgress(0); }}
              >
                <svg viewBox="0 0 36 36" className="w-5 h-5">
                  <circle cx="18" cy="18" r="16" stroke="#3d3d3d" strokeWidth="3" fill="none" />
                  <circle cx="18" cy="18" r="16" stroke="#9ca3af" strokeWidth="3" fill="none"
                    strokeDasharray={`${Math.max(1, Math.floor(rotationProgress * 100))}, 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
                </svg>
              </button>
            )}
            {/* Connection status indicator */}
            {!loading && connectionStatus !== 'connecting' && (
              <button
                type="button"
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 right-12 touch-manipulation"
                onClick={() => setShowConnectionDetails(!showConnectionDetails)}
                title={formatConnectionTooltip(connectionDetails)}
              >
                <div className="relative w-3 h-3">
                  {/* Mask to hide underlying text/underline */}
                  <div className="absolute -inset-0.5 rounded-full bg-[#2d2d2d]" />
                  <div className={`relative w-3 h-3 rounded-full border-2 border-white/20 shadow-sm ${
                    connectionStatus === 'connected' ? 'bg-green-400' : 
                    connectionStatus === 'timeout' ? 'bg-yellow-400' : 'bg-gray-400'
                  }`} />
                </div>
              </button>
            )}
          </div>
          <button type="submit" disabled={loading} className="px-6 py-2 bg-[#3d3d3d] text-gray-100 rounded-lg hover:bg-[#4d4d4d] focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] disabled:opacity-50 transition-colors">
            {loading ? (resolvingAuthor ? 'Resolving...' : 'Searching...') : 'Search'}
          </button>
        </div>
        
        {translation && (
          <div className="mt-1 pl-4 text-[11px] text-gray-400 font-mono break-words whitespace-pre-wrap">
            {translation}
          </div>
        )}

        {/* Expandable connection details for mobile */}
        {showConnectionDetails && connectionDetails && (
          <div className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs">
            <div className="flex items-center justify-end mb-2">
              <button
                type="button"
                onClick={() => setShowConnectionDetails(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            
            
            {/* Reachable: union of live-connected and recently-active relays */}
            {(() => {
              const combined = Array.from(new Set([
                ...connectionDetails.connectedRelays,
                ...recentlyActive
              ]));
              if (combined.length === 0) return null;
              return (
                <div className="mb-2">
                  <div className="text-green-400 font-medium mb-1">
                    ✅ Reachable or active ({combined.length})
                  </div>
                  <div className="space-y-1">
                    {combined.map((relay, idx) => (
                      <div key={idx} className="text-gray-300 ml-2">• {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}</div>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* Connecting relays */}
            {connectionDetails.connectingRelays && connectionDetails.connectingRelays.length > 0 && (
              <div className="mb-2">
                <div className="text-yellow-400 font-medium mb-1">
                  🟡 Connecting ({connectionDetails.connectingRelays.length})
                </div>
                <div className="space-y-1">
                  {connectionDetails.connectingRelays.map((relay, idx) => (
                    <div key={idx} className="text-gray-300 ml-2">• {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}</div>
                  ))}
                </div>
              </div>
            )}
            
            {(() => {
              const combined = new Set<string>([...connectionDetails.connectedRelays, ...recentlyActive]);
              const failedFiltered = connectionDetails.failedRelays.filter((u) => !combined.has(u));
              if (failedFiltered.length === 0) return null;
              return (
                <div>
                  <div className="text-red-400 font-medium mb-1">
                    ❌ Failed ({failedFiltered.length})
                  </div>
                  <div className="space-y-1">
                    {failedFiltered.map((relay, idx) => (
                      <div key={idx} className="text-gray-300 ml-2">• {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}</div>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {(() => {
              const anyReachable = connectionDetails.connectedRelays.length > 0 || recentlyActive.length > 0;
              const anyFailed = connectionDetails.failedRelays.length > 0;
              return (!anyReachable && !anyFailed) ? (
              <div className="text-gray-400">
                No relay connection information available
              </div>
              ) : null;
            })()}

          </div>
        )}
        
        {/* Removed inline expanded-term filter buttons (gif/gifs/apng etc.) per design update */}
      </form>

      {/* Command output will be injected as first result card below */}

      {/* Client-side filters */}
      {results.length > 0 && (
        <ClientFilters
          filterSettings={filterSettings}
          onFilterChange={setFilterSettings}
          resultCount={results.length}
          filteredCount={fuseFilteredResults.length}
        />
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
                              setQuery(ex);
                              if (manageUrl) {
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('q', ex);
                                router.replace(`?${params.toString()}`);
                              }
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
              const key = event.id || `${event.kind || 0}:${event.pubkey || event.author?.pubkey || 'unknown'}:${idx}`;
              return (
                <div key={key}>
                  {parentId && renderParentChain(event)}
                  {event.kind === 0 ? (
                    <ProfileCard event={event} onAuthorClick={goToProfile} showBanner={false} />
                  ) : event.kind === 1 ? (
                    <EventCard
                      event={event}
                      onAuthorClick={goToProfile}
                      renderContent={(text) => (
                        <div className="text-gray-100 whitespace-pre-wrap break-words">{renderContentWithClickableHashtags(text)}</div>
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
                              if (manageUrl) {
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('q', q);
                                router.replace(`?${params.toString()}`);
                              }
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {event.created_at ? formatDate(event.created_at) : 'Unknown date'}
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
                        if (urls.length === 0) {
                          return <div className="text-gray-400">(no images)</div>;
                        }
                        return (
                          <div className="mt-0 grid grid-cols-1 gap-3">
                            {urls.map((src, idx) => (
                              <div key={src} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
                                {blurhashes.length > 0 ? (
                                  <div className="absolute inset-0">
                                    <Blurhash hash={blurhashes[idx] || blurhashes[0]} width={'100%'} height={'100%'} resolutionX={32} resolutionY={32} punch={1} />
                                  </div>
                                ) : null}
                                {isAbsoluteHttpUrl(src) ? (
                                  <Image src={src} alt="picture" width={1024} height={1024} className="relative h-auto w-full object-contain" unoptimized />
                                ) : null}
                              </div>
                            ))}
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
                              if (manageUrl) {
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('q', q);
                                router.replace(`?${params.toString()}`);
                              }
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {event.created_at ? formatDate(event.created_at) : 'Unknown date'}
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
                        const contentUrls = extractVideoUrls(event.content || '');
                        const all = Array.from(new Set([...
                          urls,
                          ...contentUrls
                        ]));
                        if (all.length === 0) {
                          return <div className="text-gray-400">(no video)</div>;
                        }
                        return (
                          <div className="mt-0 grid grid-cols-1 gap-3">
                            {all.map((src) => (
                              <div key={src} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
                                <video controls playsInline className="w-full h-auto">
                                  <source src={src} />
                                  Your browser does not support the video tag.
                                </video>
                              </div>
                            ))}
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
                              if (manageUrl) {
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('q', q);
                                router.replace(`?${params.toString()}`);
                              }
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {event.created_at ? formatDate(event.created_at) : 'Unknown date'}
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
                              if (manageUrl) {
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('q', q);
                                router.replace(`?${params.toString()}`);
                              }
                              handleSearch(q);
                            } catch {}
                          }}
                        >
                          {event.created_at ? formatDate(event.created_at) : 'Unknown date'}
                        </button>
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      }, [fuseFilteredResults, expandedParents, manageUrl, searchParams, goToProfile, handleSearch, renderContentWithClickableHashtags, renderNoteMedia, renderParentChain, router, getReplyToEventId, topCommandText, topExamples])}
    </div>
  );
}


