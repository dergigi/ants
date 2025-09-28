'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { connect, nextExample, ndk, ConnectionStatus, addConnectionStatusListener, removeConnectionStatusListener, getRecentlyActiveRelays, safeSubscribe } from '@/lib/ndk';
import { resolveAuthorToNpub } from '@/lib/vertex';
import { NDKEvent, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { searchEvents, expandParenthesizedOr, parseOrQuery } from '@/lib/search';
import { applySimpleReplacements } from '@/lib/search/replacements';
import { applyContentFilters, isEmojiSearch } from '@/lib/contentAnalysis';
import { isAbsoluteHttpUrl, formatUrlForDisplay, extractImageUrls, extractVideoUrls, extractNonMediaUrls, getFilenameFromUrl } from '@/lib/utils/urlUtils';
import { updateSearchQuery } from '@/lib/utils/navigationUtils';
import { extractImetaImageUrls, extractImetaVideoUrls, extractImetaBlurhashes, extractImetaDimensions, extractImetaHashes } from '@/lib/picture';
import { Blurhash } from 'react-blurhash';
// Use unified cached NIP-05 checker for DRYness and to leverage persistent cache
import { checkNip05 as verifyNip05Async } from '@/lib/vertex';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getCurrentProfileNpub, toImplicitUrlQuery, toExplicitInputFromUrl, ensureAuthorForBackend, decodeUrlQuery } from '@/lib/search/queryTransforms';
import { profileEventFromPubkey } from '@/lib/vertex';
import { getProfileScopeIdentifiers, hasProfileScope, addProfileScope, removeProfileScope } from '@/lib/search/profileScope';
import Image from 'next/image';
import EventCard from '@/components/EventCard';
import UrlPreview from '@/components/UrlPreview';
import ProfileCard from '@/components/ProfileCard';
import ClientFilters, { FilterSettings } from '@/components/ClientFilters';
import CopyButton from '@/components/CopyButton';
import ProfileScopeIndicator from '@/components/ProfileScopeIndicator';
import FilterCollapsed from '@/components/FilterCollapsed';
import RelayCollapsed from '@/components/RelayCollapsed';
import { nip19 } from 'nostr-tools';
import { extractNip19Identifiers, decodeNip19Pointer } from '@/lib/utils/nostrIdentifiers';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { shortenNevent, shortenNpub, shortenString, trimImageUrl, isHashtagOnlyQuery, hashtagQueryToUrl } from '@/lib/utils';
import { NDKUser } from '@nostr-dev-kit/ndk';
import emojiRegex from 'emoji-regex';
import { faMagnifyingGlass, faImage, faExternalLink, faUser, faEye, faChevronDown, faChevronUp, faEquals } from '@fortawesome/free-solid-svg-icons';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { formatRelativeTimeAuto } from '@/lib/relativeTime';
import { formatEventTimestamp } from '@/lib/utils/eventHelpers';
import { TEXT_MAX_LENGTH, TEXT_LINK_CHAR_COUNT, SEARCH_FILTER_THRESHOLD } from '@/lib/constants';
import { HIGHLIGHTS_KIND } from '@/lib/highlights';

// Reusable search icon button component
function SearchIconButton({ 
  onClick, 
  title, 
  className = "" 
}: { 
  onClick: () => void; 
  title: string; 
  className?: string; 
}) {
  return (
    <button
      type="button"
      className={`absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200 ${className}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <FontAwesomeIcon icon={faMagnifyingGlass} className="w-3 h-3" />
    </button>
  );
}


// Component for truncating long text with fade effect and expand arrow
function TruncatedText({ 
  content, 
  maxLength = TEXT_MAX_LENGTH, 
  className = '',
  renderContentWithClickableHashtags
}: { 
  content: string; 
  maxLength?: number; 
  className?: string;
  renderContentWithClickableHashtags: (content: string) => React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!content) return null;
  
  // Calculate effective length considering links as 10 characters each
  const calculateEffectiveLength = (text: string): number => {
    // Regex patterns for different types of links
    const urlPattern = /https?:\/\/[^\s]+/g;

    let effectiveLength = text.length;

    const urls = text.match(urlPattern) || [];
    urls.forEach(url => {
      effectiveLength = effectiveLength - url.length + TEXT_LINK_CHAR_COUNT;

      const nestedIdentifiers = extractNip19Identifiers(url);
      nestedIdentifiers.forEach(identifier => {
        effectiveLength = effectiveLength - identifier.length + TEXT_LINK_CHAR_COUNT;
      });
    });

    const directIdentifiers = extractNip19Identifiers(text);
    directIdentifiers.forEach(identifier => {
      const alreadyCovered = urls.some(url => url.includes(identifier));
      if (alreadyCovered) return;
      effectiveLength = effectiveLength - identifier.length + TEXT_LINK_CHAR_COUNT;
    });

    return effectiveLength;
  };
  
  const effectiveLength = calculateEffectiveLength(content);
  const shouldTruncate = effectiveLength > maxLength;
  
  // For display, we still need to truncate the actual text
  const displayText = isExpanded || !shouldTruncate ? content : content.slice(0, maxLength);
  
  return (
    <div className={`relative ${className}`}>
      <div className={shouldTruncate && !isExpanded ? 'relative' : ''}>
        {renderContentWithClickableHashtags(displayText)}
        {shouldTruncate && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#2d2d2d] to-transparent pointer-events-none" />
        )}
      </div>
      {shouldTruncate && (
        <div className="mt-0.5">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
          >
            <FontAwesomeIcon 
              icon={isExpanded ? faChevronUp : faChevronDown} 
              className="w-3 h-3" 
            />
          </button>
        </div>
      )}
    </div>
  );
}

// Reusable reverse image search button component
function ReverseImageSearchButton({ 
  imageUrl, 
  className = "" 
}: { 
  imageUrl: string; 
  className?: string; 
}) {
  const handleReverseSearch = () => {
    const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
    window.open(lensUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      className={`absolute top-1.5 left-1.5 z-10 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200 ${className}`}
      title="Reverse image search with Google Lens (external)"
      onClick={(e) => {
        e.stopPropagation();
        handleReverseSearch();
      }}
    >
      <div className="relative">
        <FontAwesomeIcon icon={faEye} className="w-3 h-3" />
        <FontAwesomeIcon icon={faExternalLink} className="absolute -top-1 -right-1 w-2 h-2 text-gray-400" />
      </div>
    </button>
  );
}
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

// Component to handle image loading with blurhash placeholder
function ImageWithBlurhash({ 
  src, 
  blurhash, 
  alt, 
  width, 
  height, 
  dim,
  onClickSearch
}: {
  src: string;
  blurhash?: string;
  alt: string;
  width: number;
  height: number;
  dim?: { width: number; height: number } | null;
  onClickSearch?: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [measuredDim, setMeasuredDim] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setMeasuredDim(null);
  }, [src]);

  if (!isAbsoluteHttpUrl(src)) {
    return null;
  }

  const effectiveDim = dim && dim.width > 0 && dim.height > 0 ? dim : measuredDim;
  const aspectStyle = effectiveDim
    ? { aspectRatio: `${effectiveDim.width} / ${effectiveDim.height}` }
    : { minHeight: '200px' as const };

  return (
    <div 
      className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f] group"
      style={aspectStyle}
    >
      {/* Blurhash placeholder - shown while loading or on error */}
      {blurhash && (!imageLoaded || imageError) && (
        <div className="absolute inset-0">
          <Blurhash 
            hash={blurhash} 
            width={'100%'} 
            height={'100%'} 
            resolutionX={32} 
            resolutionY={32} 
            punch={1} 
          />
        </div>
      )}

      {/* Subtle loading spinner on top of blurhash while the image loads */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="h-6 w-6 rounded-full border-2 border-gray-300/70 border-t-transparent animate-spin"
            aria-label="Loading image"
          />
        </div>
      )}

      {/* Error state: show status code while keeping blurhash (if any) */}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="px-3 py-2 rounded-md bg-black/40 text-gray-200 text-sm flex items-center justify-center gap-2 border border-[#3d3d3d]">
            <FontAwesomeIcon icon={faImage} className="opacity-80" />
            <span className="flex-1 text-center">{statusCode ?? 'Error'}</span>
            <button
              type="button"
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Open image in new tab"
              onClick={(e) => {
                e.stopPropagation();
                window.open(src, '_blank', 'noopener,noreferrer');
              }}
            >
              <FontAwesomeIcon icon={faExternalLink} className="text-xs opacity-80" />
            </button>
          </div>
        </div>
      )}
      
      {/* Real image - hidden until loaded */}
      <Image 
        src={trimImageUrl(src)} 
        alt={alt}
        width={width}
        height={height} 
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        unoptimized
        onLoad={(e) => { 
          setImageLoaded(true); 
          setStatusCode(200); 
          try {
            const img = e.currentTarget as HTMLImageElement;
            if (!effectiveDim && img?.naturalWidth && img?.naturalHeight) {
              setMeasuredDim({ width: img.naturalWidth, height: img.naturalHeight });
            }
          } catch {}
        }}
        onError={() => {
          setImageError(true);
          try {
            // Some browsers expose a 'naturalWidth' of 0 on 404 but no status code; try fetch HEAD
            fetch(src, { method: 'HEAD' }).then((res) => {
              setStatusCode(res.status || null);
            }).catch(() => setStatusCode(null));
          } catch { setStatusCode(null); }
        }}
      />
      
      {/* Search icon button - only show when image is loaded and onClickSearch is provided */}
      {imageLoaded && !imageError && onClickSearch && (
        <SearchIconButton
          onClick={onClickSearch}
          title="Search for this image"
        />
      )}
      
      {/* Reverse image search button - only show when image is loaded */}
      {imageLoaded && !imageError && (
        <ReverseImageSearchButton
          imageUrl={src}
        />
      )}

      {/* Copy image URL button - bottom right */}
      {imageLoaded && !imageError && (
        <div className="absolute bottom-1.5 right-1.5 z-10">
          <CopyButton 
            text={src} 
            title="Copy image URL" 
            className="w-7 h-7 text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200"
          />
        </div>
      )}

      {/* Open external button - bottom left */}
      {imageLoaded && !imageError && (
        <button
          type="button"
          className="absolute bottom-1.5 left-1.5 z-10 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200"
          title="Open image in new tab"
          onClick={(e) => {
            e.stopPropagation();
            window.open(src, '_blank', 'noopener,noreferrer');
          }}
        >
          <FontAwesomeIcon icon={faExternalLink} className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Component to handle video loading with blurhash placeholder
function VideoWithBlurhash({ 
  src, 
  blurhash, 
  dim,
  onClickSearch
}: {
  src: string;
  blurhash?: string;
  dim?: { width: number; height: number } | null;
  onClickSearch?: () => void;
}) {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  useEffect(() => {
    setVideoLoaded(false);
    setVideoError(false);
  }, [src]);

  if (!isAbsoluteHttpUrl(src)) {
    return null;
  }

  const aspectStyle = dim && dim.width > 0 && dim.height > 0
    ? { aspectRatio: `${dim.width} / ${dim.height}` }
    : { minHeight: '200px' as const };

  return (
    <div 
      className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f] group"
      style={aspectStyle}
    >
      {/* Blurhash placeholder - shown while loading or on error */}
      {blurhash && (!videoLoaded || videoError) && (
        <div className="absolute inset-0">
          <Blurhash 
            hash={blurhash} 
            width={'100%'} 
            height={'100%'} 
            resolutionX={32} 
            resolutionY={32} 
            punch={1} 
          />
        </div>
      )}

      {/* Subtle loading spinner on top of blurhash while the video loads */}
      {!videoLoaded && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="h-6 w-6 rounded-full border-2 border-gray-300/70 border-t-transparent animate-spin"
            aria-label="Loading video"
          />
        </div>
      )}

      {/* Error state: show status code while keeping blurhash (if any) */}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="px-3 py-2 rounded-md bg-black/40 text-gray-200 text-sm flex items-center justify-center gap-2 border border-[#3d3d3d]">
            <FontAwesomeIcon icon={faImage} className="opacity-80" />
            <span className="flex-1 text-center">{statusCode ?? 'Error'}</span>
            <button
              type="button"
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Open video in new tab"
              onClick={(e) => {
                e.stopPropagation();
                window.open(src, '_blank', 'noopener,noreferrer');
              }}
            >
              <FontAwesomeIcon icon={faExternalLink} className="text-xs opacity-80" />
            </button>
          </div>
        </div>
      )}
      
      {/* Real video - hidden until loaded */}
      <video 
        controls 
        playsInline 
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          videoLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoadedData={() => { setVideoLoaded(true); setStatusCode(200); }}
        onError={() => {
          setVideoError(true);
          try {
            // Try to fetch HEAD to get status code
            fetch(src, { method: 'HEAD' }).then((res) => {
              setStatusCode(res.status || null);
            }).catch(() => setStatusCode(null));
          } catch { setStatusCode(null); }
        }}
      >
        <source src={src} />
        Your browser does not support the video tag.
      </video>
      
      {/* Search icon button - only show when video is loaded and onClickSearch is provided */}
      {videoLoaded && !videoError && onClickSearch && (
        <SearchIconButton
          onClick={onClickSearch}
          title="Search for this video"
        />
      )}
      
      {/* Reverse image search button - only show when video is loaded */}
      {videoLoaded && !videoError && (
        <ReverseImageSearchButton
          imageUrl={src}
        />
      )}
    </div>
  );
}

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
  const searchRowRef = useRef<HTMLFormElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Removed expanded-term chip UI and related state to simplify UX
  const [rotationProgress, setRotationProgress] = useState(0);
  const [rotationSeed, setRotationSeed] = useState(0);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [showFilterDetails, setShowFilterDetails] = useState(false);
  const [recentlyActive, setRecentlyActive] = useState<string[]>([]);
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);
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

  const extractImageUrlsFromText = useCallback((text: string): string[] => {
    return extractImageUrls(text).slice(0, 3);
  }, []);

  const extractVideoUrlsFromText = useCallback((text: string): string[] => {
    return extractVideoUrls(text).slice(0, 2);
  }, []);

  const extractNonMediaUrlsFromText = (text: string): string[] => {
    return extractNonMediaUrls(text).slice(0, 2);
  };

  // Use the utility function from urlUtils

  // Shared utility for normalizing whitespace while preserving newlines
  const normalizeWhitespace = useCallback((text: string): string => {
    return text.replace(/[ \t]{2,}/g, ' ').trim();
  }, []);

  const stripMediaUrls = useCallback((text: string): string => {
    if (!text) return '';
    const cleaned = text
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg))(?:[?#][^\s]*)?/gi, '')
      .replace(/(https?:\/\/[^\s'"<>]+?\.(?:mp4|webm|ogg|ogv|mov|m4v))(?:[?#][^\s]*)?/gi, '')
      .replace(/\?[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '')
      .replace(/\?name=[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '');
    return normalizeWhitespace(cleaned);
  }, [normalizeWhitespace]);

  const stripPreviewUrls = useCallback((text: string): string => {
    if (!text) return '';
    let cleaned = text;
    successfulPreviews.forEach((url) => {
      if (!url) return;
      const trimmedUrl = url.replace(/[),.;]+$/, '');
      if (!trimmedUrl) return;
      const escapedUrl = trimmedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const regex = new RegExp(`${escapedUrl}[),.;]*`, 'gi');
        cleaned = cleaned.replace(regex, '');
      } catch (error) {
        cleaned = cleaned.split(trimmedUrl).join('');
        console.warn('Failed to strip preview URL', url, error);
      }
    });
    return normalizeWhitespace(cleaned);
  }, [successfulPreviews, normalizeWhitespace]);

  const renderContentWithClickableHashtags = useCallback((content: string, options?: { disableNevent?: boolean; skipPointerIds?: Set<string> }) => {
    const strippedContent = stripPreviewUrls(stripMediaUrls(content));
    if (!strippedContent) return null;

    const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
    const nostrIdentityRegex = /(nostr:(?:nprofile1|npub1)[0-9a-z]+)(?!\w)/gi;
    const nostrEventRegex = /(nostr:nevent1[0-9a-z]+)(?!\w)/gi;
    const nostrAddressRegex = /(nostr:naddr1[0-9a-z]+)(?!\w)/gi;
    const nostrNoteRegex = /(nostr:note1[0-9a-z]+)(?!\w)/gi;

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
              setLabel(display || `npub:${shortenNpub(npubVal)}`);
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

      const fetchWithRelayHints = async (filters: NDKFilter[], relayUrls?: string[], hintedTimeout = 5000, fallbackTimeout = 8000): Promise<NDKEvent | null> => {
        const attempt = async (options: { relaySet?: NDKRelaySet | null; timeout: number }): Promise<NDKEvent | null> => {
          return new Promise<NDKEvent | null>((resolve) => {
            const sub = safeSubscribe(filters, { closeOnEose: true, relaySet: options.relaySet ?? undefined });
            if (!sub) {
              resolve(null);
              return;
            }
            let resolved = false;
            const finish = (result: NDKEvent | null) => {
              if (resolved) return;
              resolved = true;
              try { sub.stop(); } catch {}
              resolve(result);
            };
            const timer = setTimeout(() => finish(null), options.timeout);
            sub.on('event', (evt: NDKEvent) => {
              clearTimeout(timer);
              finish(evt);
            });
            sub.on('eose', () => {
              clearTimeout(timer);
              finish(null);
            });
            sub.start();
          });
        };

        const hintedRelays = Array.isArray(relayUrls)
          ? Array.from(
              new Set(
                relayUrls
                  .map((r) => (typeof r === 'string' ? r.trim() : ''))
                  .filter(Boolean)
                  .map((r) => (/^wss?:\/\//i.test(r) ? r : `wss://${r}`))
              )
            )
          : [];

        if (hintedRelays.length > 0) {
          try {
            const relaySet = NDKRelaySet.fromRelayUrls(hintedRelays, ndk);
            const viaHints = await attempt({ relaySet, timeout: hintedTimeout });
            if (viaHints) return viaHints;
          } catch {
            // Ignore relay set creation issues and fall back
          }
        }

        return attempt({ relaySet: null, timeout: fallbackTimeout });
      };

      // Inline component to render embedded/quoted nevent or naddr pointer
      function InlineNostrReference({ token }: { token: string }) {
        const [embedded, setEmbedded] = useState<NDKEvent | null>(null);
        const [loading, setLoading] = useState<boolean>(true);
        const [error, setError] = useState<string | null>(null);

        useEffect(() => {
          let isMounted = true;
          (async () => {
            try {
              const m = token.match(/^(nostr:(?:nevent1|naddr1|note1)[0-9a-z]+)([),.;]*)$/i);
              const coreToken = (m ? m[1] : token).replace(/^nostr:/i, '');
              const decoded = nip19.decode(coreToken);
              if (!decoded || (decoded.type !== 'nevent' && decoded.type !== 'naddr' && decoded.type !== 'note')) {
                throw new Error('Unsupported pointer');
              }

              let fetched: NDKEvent | null = null;
              if (decoded.type === 'nevent' || decoded.type === 'note') {
                const data = decoded.data as { id: string; relays?: string[] };
                const { id, relays } = data;
                fetched = await fetchWithRelayHints([{ ids: [id] }], relays ?? []);
              } else if (decoded.type === 'naddr') {
                const data = decoded.data as { pubkey: string; identifier: string; kind: number; relays?: string[] };
                const filter: NDKFilter = {
                  kinds: [data.kind],
                  authors: [data.pubkey],
                  '#d': [data.identifier],
                  limit: 1
                };
                fetched = await fetchWithRelayHints([filter], data.relays ?? []);
              }

              if (!isMounted) return;
              if (fetched) {
                setEmbedded(fetched);
              } else {
                setError('Not found');
              }
            } catch (err) {
              if (!isMounted) return;
              setError(err instanceof Error ? err.message : 'Invalid reference');
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

        const createdAt = embedded.created_at;

        return (
          <div className="w-full">
            <EventCard
              event={embedded}
              onAuthorClick={goToProfile}
              renderContent={(text) => (
                <TruncatedText 
                  content={text} 
                  maxLength={TEXT_MAX_LENGTH}
                  className="text-gray-100 whitespace-pre-wrap break-words"
                renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { disableNevent: true, skipPointerIds: new Set([embedded.id?.toLowerCase?.() || '']) })}
                />
              )}
              variant="inline"
              footerRight={createdAt ? (
                <button
                  type="button"
                  className="text-xs hover:underline opacity-80"
                  title="Search this reference"
                  onClick={() => {
                    const q = token;
                    setQueryAndUpdateUrl(q);
                    handleSearch(q);
                  }}
                >
                  {formatRelativeTimeAuto(createdAt)}
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
    const combinedSource = `${nostrEventRegex.source}|${nostrAddressRegex.source}|${nostrNoteRegex.source}`;
    const nostrSplit = options?.disableNevent ? [chunk] : chunk.split(new RegExp(`(${combinedSource})`, 'gi'));
    const combinedRegex = new RegExp(`^nostr:(?:nevent1|naddr1|note1)[0-9a-z]+[),.;]*$`, 'i');
        const seenPointers = new Set<string>();
        nostrSplit.forEach((sub, subIdx) => {
          if (!sub) return;
          const isNostrToken = combinedRegex.test(sub);
          if (!options?.disableNevent && isNostrToken) {
            const match = sub.match(/^(nostr:(nevent1|naddr1|note1)[0-9a-z]+)([),.;]*)$/i);
            const coreToken = match ? match[1] : sub;
            const type = match ? match[2] : '';
            const trailing = (match && match[3]) || '';
            const normalizedPointer = coreToken.trim().toLowerCase();
            if (seenPointers.has(normalizedPointer)) {
              if (trailing) finalNodes.push(trailing);
              return;
            }
            seenPointers.add(normalizedPointer);
            const typeLower = type?.toLowerCase() || '';
            if (typeLower.startsWith('nevent') || typeLower.startsWith('note')) {
              try {
                const decoded = nip19.decode(coreToken.replace(/^nostr:/i, ''));
                let pointerId = '';
                if (decoded?.type === 'nevent') {
                  pointerId = ((decoded.data as { id: string }).id || '').toLowerCase();
                } else if (decoded?.type === 'note') {
                  pointerId = (decoded.data as string) || '';
                  pointerId = pointerId.toLowerCase();
                }
                if (pointerId && options?.skipPointerIds?.has(pointerId)) {
                  if (trailing) finalNodes.push(trailing);
                  return;
                }
              } catch {}
              finalNodes.push(
                <div key={`nevent-${segIndex}-${chunkIdx}-${subIdx}`} className="my-2 w-full">
                  <InlineNostrReference token={coreToken} />
                </div>
              );
            } else if (typeLower.startsWith('naddr')) {
              finalNodes.push(
                <div key={`naddr-${segIndex}-${chunkIdx}-${subIdx}`} className="my-2 w-full">
                  <InlineNostrReference token={coreToken} />
                </div>
              );
            }
            if (trailing) finalNodes.push(trailing);
            return;
          }

          // Process hashtags and emojis within the remaining text
          const parts = (sub || '').split(/(#\w+)/g);
          parts.forEach((part, index) => {
            if (part.startsWith('#')) {
              finalNodes.push(
                <button
                  key={`hashtag-${segIndex}-${chunkIdx}-${subIdx}-${index}`}
                  onClick={() => {
                    const nextQuery = part;
                    setQuery(nextQuery);
                    updateUrlForSearch(nextQuery);
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
                        setQueryAndUpdateUrl(nextQuery);
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
  }, [stripPreviewUrls, stripMediaUrls, setQuery, handleSearch, setLoading, setResults, abortControllerRef, goToProfile, setQueryAndUpdateUrl, updateUrlForSearch]);

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
      {extractImageUrlsFromText(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractImageUrlsFromText(content).map((src, index) => {
            const trimmedSrc = src.trim();
            return (
            <div key={`image-${index}-${trimmedSrc}`} className="relative">
              {isAbsoluteHttpUrl(trimmedSrc) ? (
                <ImageWithBlurhash
                  src={trimImageUrl(trimmedSrc)}
                  alt="linked media"
                  width={1024}
                  height={1024}
                  dim={null}
                  onClickSearch={() => {
                    const filename = getFilenameFromUrl(trimmedSrc);
                    const nextQuery = filename;
                    setQuery(filename);
                    if (manageUrl) {
                      updateUrlForSearch(filename);
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
              ) : null}
            </div>
            );
          })}
        </div>
      )}
      {extractVideoUrlsFromText(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractVideoUrlsFromText(content).map((src, index) => {
            const trimmedSrc = src.trim();
            return (
            <div key={`video-${index}-${trimmedSrc}`} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
              <video controls playsInline className="w-full h-auto">
                <source src={trimmedSrc} />
                Your browser does not support the video tag.
              </video>
            </div>
            );
          })}
        </div>
      )}
      {extractNonMediaUrlsFromText(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractNonMediaUrlsFromText(content).map((u, index) => (
            <UrlPreview
              key={`url-${index}-${u}`}
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
            />
          ))}
        </div>
      )}
    </>
  ), [extractImageUrlsFromText, extractVideoUrlsFromText, setQuery, manageUrl, setQueryAndUpdateUrl, updateUrlForSearch]);

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
      const parentLabel = (() => {
        if (!parentId) return 'Unknown parent';
        const normalized = parentId.trim();
        if (/^[0-9a-f]{64}$/i.test(normalized)) {
          try {
            return shortenNevent(nip19.neventEncode({ id: normalized }));
          } catch {}
        }
        return shortenString(normalized, 10, 6);
      })();
      return (
        <div className={barClasses}>
          <button type="button" onClick={handleToggle} className="w-full text-left">
            {isLoading ? 'Loading parent…' : `Replying to: ${parentLabel}`}
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
              <TruncatedText 
                content={text} 
                maxLength={TEXT_MAX_LENGTH}
                className="text-gray-100 whitespace-pre-wrap break-words"
                renderContentWithClickableHashtags={renderContentWithClickableHashtags}
              />
            )}
            mediaRenderer={renderNoteMedia}
            className="p-0 border-0 bg-transparent"
          />
        </div>
      </>
    );
  }, [getReplyToEventId, expandedParents, setExpandedParents, fetchEventById, renderNoteMedia, goToProfile, renderContentWithClickableHashtags]);

  return (
    <div className="w-full pt-4">
      <form ref={searchRowRef} onSubmit={handleSubmit} className={`w-full ${avatarOverlap ? 'pr-16' : ''}`} id="search-row">
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
          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              placeholder={placeholder}
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
              onClick={() => { setPlaceholder(nextExample()); setRotationProgress(0); setRotationSeed((s) => s + 1); }}
              >
                <svg viewBox="0 0 36 36" className="w-5 h-5">
                  <circle cx="18" cy="18" r="16" stroke="#3d3d3d" strokeWidth="3" fill="none" />
                  <circle cx="18" cy="18" r="16" stroke="#9ca3af" strokeWidth="3" fill="none"
                    strokeDasharray={`${Math.max(1, Math.floor(rotationProgress * 100))}, 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
                </svg>
              </button>
            )}
          </div>
          <button 
            type={showExternalButton ? "button" : "submit"} 
            onClick={showExternalButton ? handleOpenExternal : undefined}
            className="px-6 py-2 bg-[#3d3d3d] text-gray-100 rounded-lg hover:bg-[#4d4d4d] focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] transition-colors"
            title={showExternalButton ? "Open URL in new tab" : profileScopeUser ? `Searching in ${profileScopeUser.profile?.displayName || profileScopeUser.profile?.name || shortenNpub(profileScopeUser.npub)}'s posts` : "Search"}
          >
            {loading ? (
              resolvingAuthor ? (
                <FontAwesomeIcon icon={faUser} className="animate-spin" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
              )
            ) : showExternalButton ? (
              <FontAwesomeIcon icon={faExternalLink} />
            ) : (
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            )}
          </button>
        </div>
        
        {translation && (
          <div 
            id="search-explanation" 
            className={`mt-1 text-[11px] text-gray-400 font-mono break-words whitespace-pre-wrap flex items-start gap-2 ${
              translation.split('\n').length > 2 ? 'cursor-pointer hover:bg-gray-800/20 rounded px-1 py-0.5 -mx-1 -my-0.5' : ''
            }`}
            onClick={() => {
              if (translation.split('\n').length > 2) {
                setIsExplanationExpanded(!isExplanationExpanded);
              }
            }}
          >
            <FontAwesomeIcon icon={faEquals} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              {translation.split('\n').length > 2 && !isExplanationExpanded ? (
                <>
                  <div className="overflow-hidden" style={{ 
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {translation.split('\n').slice(0, 2).join('\n')}
                  </div>
                  <div className="flex items-center justify-center mt-1 text-gray-500">
                    <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
                  </div>
                </>
              ) : (
                <>
                  <span>{translation}</span>
                  {translation.split('\n').length > 2 && (
                    <div className="flex items-center justify-center mt-1 text-gray-500">
                      <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        
        {/* Removed inline expanded-term filter buttons (gif/gifs/apng etc.) per design update */}
      </form>

      {/* Command output will be injected as first result card below */}

      {/* Collapsed state - always in same row */}
      {(loading || results.length > 0) && (
        <div className="w-full">
          {/* Button row - always collapsed states */}
          <div className="flex items-center justify-end gap-3">
            <RelayCollapsed
              connectionStatus={connectionStatus}
              connectedCount={connectionDetails?.connectedRelays?.length || 0}
              totalCount={(connectionDetails?.connectedRelays?.length || 0) + (connectionDetails?.failedRelays?.length || 0) + (connectionDetails?.connectingRelays?.length || 0)}
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
            <div className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full">
              
              {/* Reachable: union of live-connected and recently-active relays */}
              {(() => {
                const combined = Array.from(new Set([
                  ...(connectionDetails?.connectedRelays || []),
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
              {connectionDetails?.connectingRelays && connectionDetails.connectingRelays.length > 0 && (
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
                const combined = new Set<string>([...(connectionDetails?.connectedRelays || []), ...recentlyActive]);
                const failedFiltered = (connectionDetails?.failedRelays || []).filter((u) => !combined.has(u));
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
                const anyReachable = (connectionDetails?.connectedRelays?.length || 0) > 0 || recentlyActive.length > 0;
                const anyFailed = (connectionDetails?.failedRelays?.length || 0) > 0;
                return (!anyReachable && !anyFailed) ? (
                <div className="text-gray-400">
                  No relay connection information available
                </div>
                ) : null;
              })()}
            </div>
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
                        const contentUrls = extractVideoUrlsFromText(event.content || '');
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
      }, [fuseFilteredResults, expandedParents, manageUrl, goToProfile, handleSearch, renderContentWithClickableHashtags, renderNoteMedia, renderParentChain, getReplyToEventId, topCommandText, topExamples, extractVideoUrlsFromText, setQueryAndUpdateUrl, updateUrlForSearch])}
    </div>
  );
}


