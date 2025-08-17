'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { connect, getCurrentExample, ndk } from '@/lib/ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { searchEvents } from '@/lib/search';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import ProfileCard from '@/components/ProfileCard';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCircleCheck, faCircleXmark, faCircleExclamation } from '@fortawesome/free-solid-svg-icons';

type Props = {
  initialQuery?: string;
  manageUrl?: boolean;
};

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
    <button
      type="button"
      onClick={() => onAuthorClick && onAuthorClick(user.npub)}
      className={`inline-flex items-center gap-1 ${isVerified ? 'text-green-400' : 'text-red-400'} hover:underline`}
      title={value}
    >
      <FontAwesomeIcon icon={isVerified ? faCircleCheck : faCircleXmark} className="h-3 w-3" />
      <span className="truncate max-w-[14rem]">{value}</span>
    </button>
  ) : (
    <span className="inline-flex items-center gap-1 text-yellow-400">
      <FontAwesomeIcon icon={faCircleExclamation} className="h-3 w-3" />
      <span className="text-gray-400">no NIP-05</span>
    </span>
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
      <span className="truncate">{nip05Part}</span>
    </div>
  );
}

export default function SearchView({ initialQuery = '', manageUrl = true }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [placeholder, setPlaceholder] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [loadingDots, setLoadingDots] = useState('...');
  const currentSearchId = useRef(0);
  const [expandedParents, setExpandedParents] = useState<Record<string, NDKEvent | 'loading'>>({});
  const [avatarOverlap, setAvatarOverlap] = useState(false);
  const searchRowRef = useRef<HTMLFormElement | null>(null);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [baseResults, setBaseResults] = useState<NDKEvent[]>([]);

  function applyClientFilters(events: NDKEvent[], terms: string[], active: Set<string>): NDKEvent[] {
    if (terms.length === 0) return events;
    const effective = active.size > 0 ? Array.from(active) : terms;
    const termRegexes = effective.map((t) => new RegExp(`https?:\\/\\/[^\\s'"<>]+?\\.${t}(?:[?#][^\\s]*)?`, 'i'));
    return events.filter((evt) => {
      const content = evt.content || '';
      return termRegexes.some((rx) => rx.test(content));
    });
  }

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setExpandedLabel(null);
      setExpandedTerms([]);
      setActiveFilters(new Set());
      return;
    }

    setLoading(true);
    try {
      // compute expanded label/terms for media flags used without additional terms
      const hasImage = /(?:^|\s)has:image(?:\s|$)/i.test(searchQuery);
      const hasVideo = /(?:^|\s)has:video(?:\s|$)/i.test(searchQuery);
      const hasGif = /(?:^|\s)has:gif(?:\s|$)/i.test(searchQuery);
      const isImage = /(?:^|\s)is:image(?:\s|$)/i.test(searchQuery);
      const isVideo = /(?:^|\s)is:video(?:\s|$)/i.test(searchQuery);
      const isGif = /(?:^|\s)is:gif(?:\s|$)/i.test(searchQuery);
      const cleaned = searchQuery
        .replace(/(?:^|\s)has:image(?:\s|$)/gi, ' ')
        .replace(/(?:^|\s)has:video(?:\s|$)/gi, ' ')
        .replace(/(?:^|\s)has:gif(?:\s|$)/gi, ' ')
        .replace(/(?:^|\s)is:image(?:\s|$)/gi, ' ')
        .replace(/(?:^|\s)is:video(?:\s|$)/gi, ' ')
        .replace(/(?:^|\s)is:gif(?:\s|$)/gi, ' ')
        .trim();

      // Prepare local seeds to avoid relying on async state updates
      let seedTerms: string[] = [];
      let seedActive = new Set<string>();
      if (!cleaned && (hasImage || isImage || hasVideo || isVideo || hasGif || isGif)) {
        const imageTerms = ['png','jpg','jpeg','gif','webp','avif','svg'];
        const videoTerms = ['mp4','webm','ogg','ogv','mov','m4v'];
        seedTerms = (hasGif || isGif) ? ['gif'] : (hasVideo || isVideo) ? videoTerms : imageTerms;
        seedActive = new Set(seedTerms);
        setExpandedLabel(seedTerms.join(' '));
        setExpandedTerms(seedTerms);
        setActiveFilters(seedActive);
      } else {
        setExpandedLabel(null);
        setExpandedTerms([]);
        setActiveFilters(new Set());
      }

      const searchResults = await searchEvents(searchQuery);
      setBaseResults(searchResults);
      const filtered = applyClientFilters(searchResults, seedTerms, seedActive);
      setResults(filtered);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
      await connect();
      setPlaceholder(getCurrentExample());
      setIsConnecting(false);
      if (initialQuery) {
        setQuery(initialQuery);
        handleSearch(initialQuery);
      }
    };
    initializeNDK();
  }, [handleSearch, initialQuery]);

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
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      handleSearch(urlQuery);
    }
  }, [searchParams, handleSearch, manageUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const searchQuery = query.trim() || placeholder;
    setQuery(searchQuery);
    if (manageUrl) {
      const params = new URLSearchParams(searchParams.toString());
      if (searchQuery) {
        params.set('q', searchQuery);
        router.replace(`?${params.toString()}`);
        handleSearch(searchQuery);
      } else {
        params.delete('q');
        router.replace(`?${params.toString()}`);
        setResults([]);
      }
    } else {
      if (searchQuery) handleSearch(searchQuery);
      else setResults([]);
    }
  };

  const goToProfile = useCallback((npub: string) => {
    router.push(`/p/${npub}`);
  }, [router]);

  const formatDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const extractImageUrls = (text: string): string[] => {
    if (!text) return [];
    const regex = /(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg))(?!\w)/gi;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const url = m[1].replace(/[),.;]+$/, '').trim();
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
      const url = m[1].replace(/[),.;]+$/, '').trim();
      if (!matches.includes(url)) matches.push(url);
    }
    return matches.slice(0, 2);
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

  const stripMediaUrls = (text: string): string => {
    if (!text) return '';
    const cleaned = text
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg))(?:[?#][^\s]*)?/gi, '')
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:mp4|webm|ogg|ogv|mov|m4v))(?:[?#][^\s]*)?/gi, '')
      .replace(/\?[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '')
      .replace(/\?name=[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '');
    return cleaned.replace(/\s{2,}/g, ' ').trim();
  };

  const renderContentWithClickableHashtags = (content: string) => {
    const strippedContent = stripMediaUrls(content);
    if (!strippedContent) return null;

    const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;

    const splitByUrls = strippedContent.split(urlRegex);
    const finalNodes: (string | React.ReactNode)[] = [];

    splitByUrls.forEach((segment, segIndex) => {
      const isUrl = /^https?:\/\//i.test(segment);
      if (isUrl) {
        const cleanedUrl = segment.replace(/[),.;]+$/, '').trim();
        finalNodes.push(
          <span key={`url-${segIndex}`} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const nextQuery = cleanedUrl;
                setQuery(nextQuery);
                if (manageUrl) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('q', nextQuery);
                  router.replace(`?${params.toString()}`);
                }
                // Perform exact search for URLs clicked in UI
                (async () => {
                  setLoading(true);
                  try {
                    const searchResults = await searchEvents(nextQuery, undefined as unknown as number, { exact: true });
                    setResults(searchResults);
                  } catch (error) {
                    console.error('Search error:', error);
                    setResults([]);
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              className="text-blue-400 hover:text-blue-300 hover:underline break-all"
              title="Search for this URL"
            >
              {cleanedUrl}
            </button>
            <a
              href={cleanedUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open link in new tab"
              className="opacity-80 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-gray-400 text-xs" />
            </a>
          </span>
        );
        return;
      }

      // For non-URL text, process hashtags and emojis
      const parts = segment.split(/(#\w+)/g);
      parts.forEach((part, index) => {
        if (part.startsWith('#')) {
          finalNodes.push(
            <button
              key={`hashtag-${segIndex}-${index}`}
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
          const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
          const emojiParts = part.split(emojiRegex);
          const emojis = part.match(emojiRegex) || [];
          for (let i = 0; i < emojiParts.length; i++) {
            if (emojiParts[i]) finalNodes.push(emojiParts[i]);
            if (emojis[i]) {
              finalNodes.push(
                <button
                  key={`emoji-${segIndex}-${index}-${i}`}
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

    return finalNodes;
  };

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

  const renderNoteContent = (event: NDKEvent) => (
    <>
      <p className="text-gray-100 whitespace-pre-wrap break-words">{renderContentWithClickableHashtags(event.content)}</p>
      {extractImageUrls(event.content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractImageUrls(event.content).map((src) => (
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
                    const searchResults = await searchEvents(nextQuery, undefined as unknown as number, { exact: true });
                    setResults(searchResults);
                  } catch (error) {
                    console.error('Search error:', error);
                    setResults([]);
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
            >
              <Image src={src} alt="linked media" width={1024} height={1024} className="h-auto w-full object-contain" unoptimized />
            </button>
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
          {renderNoteContent(parentEvent)}
        </div>
      </>
    );
  };

  return (
    <div className={`w-full ${results.length > 0 ? 'pt-4' : 'min-h-screen flex items-center'}`}>
      <form ref={searchRowRef} onSubmit={handleSubmit} className={`w-full ${avatarOverlap ? 'pr-16' : ''}`} id="search-row">
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
                  setExpandedLabel(null);
                  setExpandedTerms([]);
                  setActiveFilters(new Set());
                  setBaseResults([]);
                  if (manageUrl) {
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete('q');
                    router.replace(`?${params.toString()}`);
                  }
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button type="submit" disabled={loading} className="px-6 py-2 bg-[#3d3d3d] text-gray-100 rounded-lg hover:bg-[#4d4d4d] focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] disabled:opacity-50 transition-colors">
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {expandedLabel && expandedTerms.length > 0 && (
          <div className="mt-1 text-xs text-gray-400 flex items-center gap-1 flex-wrap">
            {expandedTerms.map((term, i) => {
              const active = activeFilters.has(term);
              return (
                <button
                  key={`${term}-${i}`}
                  type="button"
                  className={`px-1.5 py-0.5 rounded border ${active ? 'bg-[#3a3a3a] border-[#4a4a4a] text-gray-100' : 'bg-[#2d2d2d] border-[#3d3d3d] text-gray-300'} hover:bg-[#3a3a3a]`}
                  onClick={() => {
                    const next = new Set(activeFilters);
                    if (active) next.delete(term); else next.add(term);
                    setActiveFilters(next);
                    const filtered = applyClientFilters(baseResults, expandedTerms, next);
                    setResults(filtered);
                  }}
                >
                  <span className="font-mono">{term}</span>
                </button>
              );
            })}
          </div>
        )}
      </form>

      {results.length > 0 && (
        <div className="mt-8 space-y-4">
          {results.map((event, idx) => {
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
                ) : (
                  <div className={noteCardClasses}>
                    {renderNoteContent(event)}
                    <div className="mt-4 text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] -mx-4 -mb-4 px-4 py-2 flex items-center justify-between gap-2 flex-wrap rounded-b-lg">
                      <div className="flex items-center gap-2">
                        <AuthorBadge user={event.author} onAuthorClick={goToProfile} />
                      </div>
                      <a href={`https://njump.me/${nip19.neventEncode({ id: event.id })}`} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline">
                        {event.created_at ? formatDate(event.created_at) : 'Unknown date'}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


