'use client';

import { useCallback, useEffect, useState } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faReply, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { safeSubscribe } from '@/lib/ndk';
import { shortenNevent, shortenString } from '@/lib/utils';
import RelayIndicator from '@/components/RelayIndicator';
import { getEventKindIcon, getEventKindDisplayName } from '@/lib/eventKindIcons';
import { getKindSearchQuery } from '@/lib/eventKindSearch';

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

  const getReplyToEventId = useCallback((event: NDKEvent): string | null => {
    try {
      const eTags = (event.tags || []).filter((t) => t && t[0] === 'e');
      if (eTags.length === 0) return null;
      
      // Deduplicate e tags by event ID to prevent duplicate quoted events
      const uniqueETags = new Map<string, typeof eTags[0]>();
      eTags.forEach(tag => {
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
    <div className={`${barClasses} border-t border-[#3d3d3d]`}>
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
                <span>{parentLabel}</span>
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
