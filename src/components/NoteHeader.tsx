'use client';

import { useCallback } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faReply } from '@fortawesome/free-solid-svg-icons';
import { safeSubscribe } from '@/lib/ndk';
import { shortenNevent, shortenString } from '@/lib/utils';
import RelayIndicator from '@/components/RelayIndicator';

interface NoteHeaderProps {
  event: NDKEvent;
  expandedParents?: Record<string, NDKEvent | 'loading'>;
  onParentToggle?: (parentId: string, parent: NDKEvent | 'loading' | null) => void;
  className?: string;
}

export default function NoteHeader({
  event,
  expandedParents = {},
  onParentToggle,
  className = ''
}: NoteHeaderProps) {
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
  const parentState = parentId ? expandedParents[parentId] : null;
  const isLoading = parentState === 'loading';
  const parentEvent = parentState && parentState !== 'loading' ? (parentState as NDKEvent) : null;

  const handleToggle = async () => {
    if (!parentId || !onParentToggle) return;
    
    if (expandedParents[parentId]) {
      onParentToggle(parentId, null);
      return;
    }
    onParentToggle(parentId, 'loading');
    const fetched = await fetchEventById(parentId);
    onParentToggle(parentId, fetched || 'loading');
  };

  const isReply = Boolean(parentId);
  const barClasses = `text-xs text-gray-300 border border-[#3d3d3d] px-4 py-2 border-b-0 ${
    isReply 
      ? 'bg-[#1f1f1f] hover:bg-[#262626] rounded-t-lg rounded-b-none' 
      : 'bg-[#2d2d2d] hover:bg-[#353535] rounded-none'
  } ${className}`;
  
  const parentLabel = (() => {
    if (!parentId) return null;
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
      <div className="flex items-center justify-between w-full">
        {parentId ? (
          <button 
            type="button" 
            onClick={handleToggle} 
            className="flex-1 text-left flex items-center gap-2"
          >
            {isLoading ? (
              'Loading parent…'
            ) : (
              <>
                <FontAwesomeIcon icon={faReply} className="text-xs text-gray-400 transform -rotate-270 scale-y-[-1]" />
                <span>{parentLabel}</span>
              </>
            )}
          </button>
        ) : (
          <div className="flex-1 text-left flex items-center gap-2">
            <span className="text-gray-400">Note</span>
          </div>
        )}
        <RelayIndicator event={event} className="ml-2" />
      </div>
    </div>
  );
}
