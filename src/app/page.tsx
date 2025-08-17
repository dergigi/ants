'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { connect, getCurrentExample, ndk } from '@/lib/ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { lookupVertexProfile, VERTEX_REGEXP } from '@/lib/vertex';
import { searchEvents } from '@/lib/search';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { nip19 } from 'nostr-tools';

type Nip05CheckResult = {
  isVerified: boolean;
  value: string | undefined;
};

const nip05Cache = new Map<string, boolean>();

async function verifyNip05(pubkeyHex: string, nip05?: string): Promise<boolean> {
  if (!nip05) return false;
  const cacheKey = `${nip05}|${pubkeyHex}`;
  if (nip05Cache.has(cacheKey)) return nip05Cache.get(cacheKey) as boolean;

  try {
    const [namePart, domainPartCandidate] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    const name = namePart || '_';
    const domain = (domainPartCandidate || '').trim();
    if (!domain) {
      nip05Cache.set(cacheKey, false);
      return false;
    }
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      nip05Cache.set(cacheKey, false);
      return false;
    }
    const data = await res.json();
    const mapped = (data?.names?.[name] as string | undefined)?.toLowerCase();
    const result = mapped === pubkeyHex.toLowerCase();
    nip05Cache.set(cacheKey, result);
    return result;
  } catch {
    nip05Cache.set(cacheKey, false);
    return false;
  }
}

function useNip05Status(user: NDKUser): Nip05CheckResult {
  const [verified, setVerified] = useState(false);
  const nip05 = user.profile?.nip05;
  const pubkey = user.pubkey;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const result = await verifyNip05(pubkey, nip05);
      if (isMounted) setVerified(result);
    })();
    return () => { isMounted = false; };
  }, [pubkey, nip05]);

  return { isVerified: verified, value: nip05 };
}

function AuthorBadge({ user, onAuthorClick }: { user: NDKUser, onAuthorClick?: (npub: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const { isVerified, value } = useNip05Status(user);
  const profileUrl = `https://npub.world/${user.npub}`;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await user.fetchProfile();
      } catch {}
      if (!isMounted) return;
      const display = user.profile?.displayName || user.profile?.name || '';
      setName(display);
      setLoaded(true);
    })();
    return () => { isMounted = false; };
  }, [user]);

  const nip05Part = value ? (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 ${isVerified ? 'text-green-400' : 'text-yellow-400'} hover:underline`}
      title={value}
    >
      <FontAwesomeIcon icon={isVerified ? faCircleCheck : faTriangleExclamation} className="h-4 w-4" />
      <span className="truncate max-w-[14rem]">{value}</span>
    </a>
  ) : (
    <span className="text-gray-400">no NIP-05</span>
  );

  return (
    <div className="flex items-center gap-2">
      {loaded ? (
        <button
          type="button"
          onClick={() => onAuthorClick && onAuthorClick(user.npub)}
          className="font-medium text-gray-100 hover:underline truncate max-w-[10rem] text-left"
          title={name || 'Unknown'}
        >
          {name || 'Unknown'}
        </button>
      ) : (
        <span className="font-medium text-gray-100 truncate max-w-[10rem]">Loading...</span>
      )}
      <span className="text-sm truncate">{nip05Part}</span>
    </div>
  );
}

function SearchComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [placeholder, setPlaceholder] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [loadingDots, setLoadingDots] = useState('...');
  const currentSearchId = useRef(0);
  const [needsRightPadding, setNeedsRightPadding] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Record<string, NDKEvent | 'loading'>>({});

  // Copying npub removed from UI in favor of profile + NIP-05 display

  const handleSearch = useCallback(async (searchQuery: string) => {
    const localSearchId = ++currentSearchId.current;
    setIsLoading(true);
    
    try {
      // If the field is empty, use the current placeholder
      if (!searchQuery.trim()) {
        searchQuery = placeholder;
      }
      
      console.log('Search details:', {
        inputValue: searchQuery,
        placeholder,
        searchQuery,
        usingPlaceholder: !searchQuery.trim()
      });
      
      // Check if this is a Vertex profile lookup
      if (VERTEX_REGEXP.test(searchQuery)) {
        const profile = await lookupVertexProfile(searchQuery);
        if (profile) {
          // Store the npub in local storage
          const npub = profile.author.npub;
          localStorage.setItem(`profile_${searchQuery}`, npub);
          // Set results immediately to trigger UI update
          if (localSearchId === currentSearchId.current) {
            setResults([profile]);
            setIsLoading(false);
          }
          // Update URL to reflect the profile view
          const params = new URLSearchParams(searchParams.toString());
          params.set('q', searchQuery);
          router.replace(`?${params.toString()}`);
        } else {
          if (localSearchId === currentSearchId.current) {
            setResults([]);
            setIsLoading(false);
          }
        }
      } else {
        // Regular search or author-filtered search
        const events = await searchEvents(searchQuery);
        if (localSearchId === currentSearchId.current) {
          setResults(events);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      if (localSearchId === currentSearchId.current) {
        setResults([]);
      }
    } finally {
      if (localSearchId === currentSearchId.current) {
        setIsLoading(false);
      }
    }
  }, [placeholder, router, searchParams]);

  // Dynamically determine if right padding is needed to avoid avatar overlap
  useEffect(() => {
    const computePaddingNeed = () => {
      try {
        const searchRow = document.getElementById('search-row');
        const avatar = document.getElementById('header-avatar');
        if (!searchRow || !avatar) {
          setNeedsRightPadding(false);
          return;
        }
        const rowRect = searchRow.getBoundingClientRect();
        const avatarRect = avatar.getBoundingClientRect();
        const overlapsVertically = avatarRect.top < rowRect.bottom && avatarRect.bottom > rowRect.top;
        const overlapsHorizontally = avatarRect.left < rowRect.right && avatarRect.right > rowRect.left;
        setNeedsRightPadding(overlapsVertically && overlapsHorizontally);
      } catch {
        // ignore
      }
    };

    computePaddingNeed();
    window.addEventListener('resize', computePaddingNeed);
    const id = setInterval(computePaddingNeed, 250);
    return () => {
      window.removeEventListener('resize', computePaddingNeed);
      clearInterval(id);
    };
  }, []);

  function getReplyToEventId(event: NDKEvent): string | null {
    try {
      const eTags = (event.tags || []).filter((t) => t && t[0] === 'e');
      if (eTags.length === 0) return null;
      const replyTag = eTags.find((t) => t[3] === 'reply') || eTags.find((t) => t[3] === 'root') || eTags[eTags.length - 1];
      return replyTag && replyTag[1] ? replyTag[1] : null;
    } catch {
      return null;
    }
  }

  async function fetchEventById(eventId: string): Promise<NDKEvent | null> {
    try { await connect(); } catch {}
    return new Promise<NDKEvent | null>((resolve) => {
      let found: NDKEvent | null = null;
      const sub = ndk.subscribe([{ ids: [eventId] }], { closeOnEose: true });
      const timer = setTimeout(() => { try { sub.stop(); } catch {}; resolve(found); }, 8000);
      sub.on('event', (evt: NDKEvent) => { found = evt; });
      sub.on('eose', () => { clearTimeout(timer); try { sub.stop(); } catch {}; resolve(found); });
      sub.start();
    });
  }

  const goToProfile = useCallback((npub: string) => {
    const nextQuery = `p:${npub}`;
    setQuery(nextQuery);
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', nextQuery);
    router.replace(`?${params.toString()}`);
    handleSearch(nextQuery);
  }, [handleSearch, router, searchParams]);

  const renderNoteBody = (event: NDKEvent) => (
    <>
      <p className="text-gray-100 whitespace-pre-wrap break-words">{renderContentWithClickableHashtags(event.content)}</p>
      {extractImageUrls(event.content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractImageUrls(event.content).map((src) => (
            <div key={src} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
              <Image
                src={src}
                alt="linked media"
                width={1024}
                height={1024}
                className="h-auto w-full object-contain"
                unoptimized
              />
            </div>
          ))}
        </div>
      )}
      {extractVideoUrls(event.content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractVideoUrls(event.content).map((src) => (
            <div key={src} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
              <video controls playsInline className="w-full h-auto">
                <source src={src} />
                Your browser does not support the video tag.
              </video>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-between items-center text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <AuthorBadge user={event.author} onAuthorClick={goToProfile} />
        </div>
        <a
          href={`https://njump.me/${nip19.neventEncode({ id: event.id })}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {event.created_at ? formatDate(event.created_at) : 'Unknown date'}
        </a>
      </div>
    </>
  );

  const renderParentChain = (childEvent: NDKEvent, isTop: boolean = true): React.ReactNode => {
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
          {renderNoteBody(parentEvent)}
        </div>
      </>
    );
  };

  // Loading animation effect
  useEffect(() => {
    if (!isConnecting) return;
    const interval = setInterval(() => {
      setLoadingDots(prev => {
        switch (prev) {
          case '': return '.';
          case '.': return '..';
          case '..': return '...';
          default: return '.';
        }
      });
    }, 21);

    return () => clearInterval(interval);
  }, [isConnecting]);

  useEffect(() => {
    const initializeNDK = async () => {
      setIsConnecting(true);
      await connect();
      setPlaceholder(getCurrentExample());
      setIsConnecting(false);
    };
    initializeNDK();
  }, []);

  // Initialize query from URL on mount
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      // Only perform search if this is a direct URL access (no current query)
      handleSearch(urlQuery);
    }
  }, [searchParams, handleSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // If query is empty, use placeholder
    const searchQuery = query.trim() || placeholder;
    setQuery(searchQuery);
    
    // Update URL with current query
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set('q', searchQuery);
      router.replace(`?${params.toString()}`);
      // Perform the search
      handleSearch(searchQuery);
    } else {
      params.delete('q');
      router.replace(`?${params.toString()}`);
      setResults([]);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // No longer showing shortened npub in UI

  const extractImageUrls = (text: string): string[] => {
    if (!text) return [];
    const regex = /(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|webp|avif|svg))(?!\w)/gi;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const url = m[1]
        .replace(/[),.;]+$/, '')
        .trim();
      if (!matches.includes(url)) matches.push(url);
    }
    return matches.slice(0, 3);
  };

  const extractVideoUrls = (text: string): string[] => {
    if (!text) return [];
    const regex = /(https?:\/\/[^\s'"<>]+?\.(?:mp4|webm|ogg|ogv|mov|m4v))(?!\w)/gi;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const url = m[1]
        .replace(/[),.;]+$/, '')
        .trim();
      if (!matches.includes(url)) matches.push(url);
    }
    return matches.slice(0, 2);
  };

  const stripMediaUrls = (text: string): string => {
    if (!text) return '';
    const cleaned = text
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|webp|avif|svg))(?!\w)/gi, '')
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:mp4|webm|ogg|ogv|mov|m4v))(?!\w)/gi, '');
    return cleaned.replace(/\s{2,}/g, ' ').trim();
  };

  const renderContentWithClickableHashtags = (content: string) => {
    const strippedContent = stripMediaUrls(content);
    if (!strippedContent) return null;

    // Split by hashtags and emojis, then create clickable elements
    const parts = strippedContent.split(/(#\w+|[^\s#]+)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('#')) {
        return (
          <button
            key={index}
            onClick={() => {
              const nextQuery = part;
              setQuery(nextQuery);
              const params = new URLSearchParams(searchParams.toString());
              params.set('q', nextQuery);
              router.replace(`?${params.toString()}`);
              handleSearch(nextQuery);
            }}
            className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
          >
            {part}
          </button>
        );
      }
      
      // Check if the part is an emoji (single emoji character)
      if (part && part.length === 2 && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(part)) {
        return (
          <button
            key={index}
            onClick={() => {
              const nextQuery = part;
              setQuery(nextQuery);
              const params = new URLSearchParams(searchParams.toString());
              params.set('q', nextQuery);
              router.replace(`?${params.toString()}`);
              handleSearch(nextQuery);
            }}
            className="text-yellow-400 hover:text-yellow-300 hover:scale-110 transition-transform cursor-pointer"
          >
            {part}
          </button>
        );
      }
      
      return part;
    });
  };

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className={`max-w-2xl mx-auto px-4 ${results.length > 0 ? 'pt-4' : 'min-h-screen flex items-center'}`}>
        <form
          onSubmit={handleSubmit}
          className={`w-full ${needsRightPadding ? 'pr-16' : ''}`}
          id="search-row"
        >
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isConnecting ? loadingDots : placeholder}
                className="w-full px-4 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] text-gray-100 placeholder-gray-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    currentSearchId.current++;
                    setQuery('');
                    setResults([]);
                    // Update URL to remove the query parameter
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete('q');
                    router.replace(`?${params.toString()}`);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-[#3d3d3d] text-gray-100 rounded-lg hover:bg-[#4d4d4d] focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {results.length > 0 && (
          <div className="mt-8 space-y-4">
            {results.map((event) => {
              const parentId = getReplyToEventId(event);
              const parent = parentId ? expandedParents[parentId] : undefined;
              const isLoadingParent = parent === 'loading';
              const parentEvent = parent && parent !== 'loading' ? (parent as NDKEvent) : null;
              const hasCollapsedBar = Boolean(parentId && !parentEvent && !isLoadingParent);
              const hasExpandedParent = Boolean(parentEvent);
              const noteCardClasses = `p-4 bg-[#2d2d2d] border border-[#3d3d3d] ${
                hasCollapsedBar || hasExpandedParent
                  ? 'rounded-b-lg rounded-t-none border-t-0'
                  : 'rounded-lg'
              }`;
              return (
              <div key={event.id}>
                {parentId && renderParentChain(event)}
                {event.kind === 0 ? (
                  // Profile metadata
                  <div className={noteCardClasses}>
                    <div className="flex items-center gap-4">
                      {event.author.profile?.image && (
                        <Image 
                          src={event.author.profile.image}
                          alt="Profile" 
                          width={64}
                          height={64}
                          className="rounded-full"
                          unoptimized
                        />
                      )}
                      <AuthorBadge user={event.author} onAuthorClick={goToProfile} />
                    </div>
                    {event.author.profile?.about && (
                      <p className="mt-4 text-gray-300">{event.author.profile.about}</p>
                    )}
                  </div>
                ) : (
                  // Regular note
                  <div className={noteCardClasses}>
                    {renderNoteBody(event)}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
        </div>
      </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchComponent />
    </Suspense>
  );
}
