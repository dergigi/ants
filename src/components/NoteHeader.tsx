'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faReply, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { ndk, safeSubscribe } from '@/lib/ndk';
import { shortenNevent, shortenString } from '@/lib/utils';
import { resolveProfileName, type ProfileResult } from '@/lib/utils/profileUtils';
import RelayIndicator from '@/components/RelayIndicator';
import { getEventKindIcon, getEventKindDisplayName } from '@/lib/eventKindIcons';
import { getKindSearchQuery } from '@/lib/eventKindSearch';
import { FOLLOW_PACK_KIND } from '@/lib/constants';

// Cache: eventId → author pubkey (avoids re-fetching parent events)
// Stores {pubkey, ts} so failed lookups (pubkey=null) expire after NEGATIVE_TTL_MS
const CACHE_MAX = 500;
const NEGATIVE_TTL_MS = 60_000;
const parentAuthorCache = new Map<string, { pubkey: string | null; ts: number }>();
const parentAuthorInflight = new Map<string, Promise<string | null>>();

// --- Component ---

interface NoteHeaderProps {
  event: NDKEvent;
  expandedParents?: Record<string, NDKEvent | 'loading'>;
  onParentToggle?: (parentId: string, parent: NDKEvent | 'loading' | null) => void;
  onSearch?: (query: string) => void;
  className?: string;
}

export default function NoteHeader({
  event,
  expandedParents = {},
  onParentToggle,
  onSearch,
  className = ''
}: NoteHeaderProps) {
  const [searchQuery, setSearchQuery] = useState<string | null>(null);

  // Load the search query for this event kind
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const query = await getKindSearchQuery(event.kind);
        if (isMounted) {
          setSearchQuery(query);
        }
      } catch {
        if (isMounted) {
          setSearchQuery(null);
        }
      }
    })();
    return () => { isMounted = false; };
  }, [event.kind]);

  const getReplyToInfo = useCallback((event: NDKEvent): { eventId: string; pubkey: string | null; relayHint: string | null } | null => {
    try {
      const eTags = (event.tags || []).filter((t) => t && t[0] === 'e');
      if (eTags.length === 0) return null;

      const uniqueETags = new Map<string, typeof eTags[0]>();
      eTags.forEach(tag => {
        const eventId = tag[1];
        if (!eventId) return;
        const existing = uniqueETags.get(eventId);
        const existingHasValidPk = existing?.[4] && /^[0-9a-f]{64}$/i.test(existing[4]);
        const tagHasValidPk = tag[4] && /^[0-9a-f]{64}$/i.test(tag[4]);
        // Prefer tags that have a validated hex64 pubkey
        if (!existing || (!existingHasValidPk && tagHasValidPk)) {
          uniqueETags.set(eventId, tag);
        }
      });
      const deduplicatedETags = Array.from(uniqueETags.values());

      const hasValidPk = (t: string[]) => t[4] && /^[0-9a-f]{64}$/i.test(t[4]);
      // Prefer reply marker, then root marker, then last tag.
      // Within each tier, prefer tags that carry a valid pubkey.
      const replyTag =
          deduplicatedETags.find((t) => t[3] === 'reply' && hasValidPk(t))
        || deduplicatedETags.find((t) => t[3] === 'reply')
        || deduplicatedETags.find((t) => t[3] === 'root' && hasValidPk(t))
        || deduplicatedETags.find((t) => t[3] === 'root')
        || deduplicatedETags[deduplicatedETags.length - 1];
      if (!replyTag || !replyTag[1]) return null;
      const pubkey = hasValidPk(replyTag) ? replyTag[4] : null;
      const relayHint = replyTag[2] && replyTag[2].startsWith('wss://') ? replyTag[2] : null;
      return { eventId: replyTag[1], pubkey, relayHint };
    } catch {
      return null;
    }
  }, []);

  const getReplyToEventId = useCallback((event: NDKEvent): string | null => {
    return getReplyToInfo(event)?.eventId ?? null;
  }, [getReplyToInfo]);

  const fetchEventById = useCallback(async (eventId: string): Promise<NDKEvent | null> => {
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

  const parentId = getReplyToEventId(event);

  // Find the topmost parent in the chain to show in header
  const getTopmostParent = (startEvent: NDKEvent): NDKEvent => {
    let currentEvent = startEvent;
    while (currentEvent) {
      const currentParentId = getReplyToEventId(currentEvent);
      if (!currentParentId) break;

      const currentParentState = expandedParents[currentParentId];
      if (currentParentState && currentParentState !== 'loading' && currentParentState !== null) {
        currentEvent = currentParentState as NDKEvent;
      } else {
        break;
      }
    }
    return currentEvent;
  };

  const displayEvent = getTopmostParent(event);

  // --- "replying to @username" resolution ---
  const replyInfo = getReplyToInfo(displayEvent);
  const replyAuthorPubkey = replyInfo?.pubkey ?? null;
  const replyEventId = replyInfo?.eventId ?? null;
  const replyRelayHint = replyInfo?.relayHint ?? null;
  const [replyAuthor, setReplyAuthor] = useState<ProfileResult | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset on change to prevent stale name from previous ancestor
    setReplyAuthor(null);
    if (!replyEventId) return;
    let isMounted = true;

    const resolve = async () => {
      // Step 1: determine the parent author pubkey
      let pubkey = replyAuthorPubkey;

      // If tag[4] didn't have a pubkey, fetch the parent event to get it
      if (!pubkey && replyEventId) {
        // Check cache first (with TTL — negative entries expire so transient failures retry)
        const cached = parentAuthorCache.get(replyEventId);
        if (cached && (cached.pubkey !== null || Date.now() - cached.ts < NEGATIVE_TTL_MS)) {
          pubkey = cached.pubkey;
        } else {
          // Dedupe in-flight parent fetches
          let fetchPromise = parentAuthorInflight.get(replyEventId);
          if (!fetchPromise) {
            fetchPromise = (async () => {
              try {
                // Race the fetch against a timeout to avoid hanging
                const timeoutMs = 6000;
                const fetchWithTimeout = (relaySet?: NDKRelaySet): Promise<NDKEvent | null> =>
                  Promise.race([
                    ndk.fetchEvent({ ids: [replyEventId] }, {}, relaySet),
                    new Promise<null>(r => setTimeout(() => r(null), timeoutMs))
                  ]);

                // Try relay hint first if available, then fall back to default relays
                let evt: NDKEvent | null = null;
                if (replyRelayHint) {
                  evt = await fetchWithTimeout(NDKRelaySet.fromRelayUrls([replyRelayHint], ndk));
                }
                if (!evt) {
                  evt = await fetchWithTimeout();
                }
                const authorPk = evt?.pubkey ?? null;
                if (parentAuthorCache.size >= CACHE_MAX) {
                  const firstKey = parentAuthorCache.keys().next().value;
                  if (firstKey) parentAuthorCache.delete(firstKey);
                }
                parentAuthorCache.set(replyEventId, { pubkey: authorPk, ts: Date.now() });
                return authorPk;
              } catch {
                parentAuthorCache.set(replyEventId, { pubkey: null, ts: Date.now() });
                return null;
              } finally {
                parentAuthorInflight.delete(replyEventId);
              }
            })();
            parentAuthorInflight.set(replyEventId, fetchPromise);
          }
          pubkey = await fetchPromise;
        }
      }

      if (!isMounted) return;
      if (!pubkey) return;

      // Step 2: resolve the pubkey to a display name
      const result = await resolveProfileName(pubkey);
      if (isMounted) setReplyAuthor(result);
    };

    // Guard: use IntersectionObserver if available, otherwise resolve immediately
    if (typeof IntersectionObserver === 'undefined' || !headerRef.current) {
      resolve();
      return () => { isMounted = false; };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        resolve();
      },
      { threshold: 0 }
    );
    observer.observe(headerRef.current);
    return () => { isMounted = false; observer.disconnect(); };
  }, [replyAuthorPubkey, replyEventId, replyRelayHint]);

  const handleToggle = async () => {
    if (!topmostParentId || !onParentToggle) return;

    if (expandedParents[topmostParentId]) {
      onParentToggle(topmostParentId, null);
      return;
    }
    onParentToggle(topmostParentId, 'loading');
    const fetched = await fetchEventById(topmostParentId);
    onParentToggle(topmostParentId, fetched);
  };

  const handleKindClick = () => {
    if (!onSearch) return;
    if (searchQuery) {
      onSearch(searchQuery);
    }
  };

  const isReply = Boolean(parentId);
  const barClasses = `text-xs text-gray-300 border border-[#3d3d3d] border-b-0 px-4 py-2 rounded-t-lg rounded-b-none ${
    isReply
      ? 'bg-[#262626]'
      : 'bg-[#353535]'
  } ${className}`;

  // Get the parent ID for the topmost parent (for next expansion)
  const topmostParentId = getReplyToEventId(displayEvent);
  const topmostParentState = topmostParentId ? expandedParents[topmostParentId] : null;
  const isLoading = topmostParentState === 'loading';

  // Extract filename for code events (supports tags: name, f, title)
  const isCodeEvent = displayEvent.kind === 1337 || displayEvent.kind === 1617;
  const getTagValue = (keys: string[]): string | null => {
    const tags = Array.isArray(displayEvent.tags) ? displayEvent.tags : [];
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) continue;
      const [k, v] = tag;
      const key = typeof k === 'string' ? k.toLowerCase() : '';
      if (keys.includes(key) && typeof v === 'string' && v) return v;
    }
    return null;
  };
  const fileName = isCodeEvent ? (getTagValue(['name', 'f', 'title']) || null) : null;

  // Extract follow pack title
  const isFollowPack = displayEvent.kind === FOLLOW_PACK_KIND;
  const followPackTitle = isFollowPack ? (getTagValue(['title']) || null) : null;

  const parentLabel = (() => {
    if (!topmostParentId) return null;
    const normalized = topmostParentId.trim();
    if (/^[0-9a-f]{64}$/i.test(normalized)) {
      try {
        return shortenNevent(nip19.neventEncode({ id: normalized }));
      } catch {}
    }
    return shortenString(normalized, 10, 6);
  })();

  return (
    <div ref={headerRef} className={`${barClasses} border-t border-[#3d3d3d]`}>
      <div className="flex items-center justify-between w-full">
        {topmostParentId ? (
          <button
            type="button"
            onClick={handleToggle}
            className="flex-1 text-left flex items-center gap-2 h-6"
          >
            {isLoading ? (
              <FontAwesomeIcon icon={faSpinner} className="text-xs text-gray-400 animate-spin" />
            ) : (
              <>
                <FontAwesomeIcon icon={faReply} className="text-xs text-gray-400 transform -rotate-270 scale-y-[-1]" />
                <span>
                  {replyAuthor
                    ? <>replying to <span className="text-blue-400">
                        {replyAuthor.isNpubFallback ? replyAuthor.display : `@${replyAuthor.display.replace(/^@/, '')}`}
                      </span></>
                    : parentLabel}
                </span>
              </>
            )}
          </button>
        ) : (
          <div className="flex-1 text-left flex items-center gap-2">
            {(() => {
              const kindIcon = getEventKindIcon(displayEvent.kind);
              const displayName = getEventKindDisplayName(displayEvent.kind);
              return (
                <>
                  {kindIcon ? (
                    <button
                      type="button"
                      onClick={handleKindClick}
                      className="w-6 h-6 rounded-md text-gray-400 hover:text-gray-300 flex items-center justify-center text-[12px] leading-none hover:bg-[#3a3a3a]"
                      title={searchQuery || displayName}
                    >
                      <FontAwesomeIcon icon={kindIcon} className="text-xs" />
                    </button>
                  ) : (
                    <span className="text-gray-400">{displayName}</span>
                  )}
                  {fileName ? (
                    <span className="text-gray-200 truncate font-semibold" title={fileName}>{fileName}</span>
                  ) : null}
                  {followPackTitle ? (
                    <span className="text-gray-200 truncate font-semibold" title={followPackTitle}>{followPackTitle}</span>
                  ) : null}

                </>
              );
            })()}
          </div>
        )}
        <RelayIndicator event={displayEvent} className="ml-2" />
      </div>
    </div>
  );
}
