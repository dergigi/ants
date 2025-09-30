'use client';

import { useCallback } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faReply } from '@fortawesome/free-solid-svg-icons';
import { safeSubscribe } from '@/lib/ndk';
import { shortenNevent, shortenString } from '@/lib/utils';
import EventCard from '@/components/EventCard';
import TruncatedText from '@/components/TruncatedText';
import RelayIndicator from '@/components/RelayIndicator';
import { TEXT_MAX_LENGTH } from '@/lib/constants';

interface ParentChainProps {
  childEvent: NDKEvent;
  isTop?: boolean;
  expandedParents: Record<string, NDKEvent | 'loading'>;
  onParentToggle: (parentId: string, parent: NDKEvent | 'loading' | null) => void;
  onAuthorClick: (npub: string) => void;
  renderContentWithClickableHashtags: (content: string, options?: { disableNevent?: boolean; skipIdentifierIds?: Set<string> }) => React.ReactNode;
  renderNoteMedia: (content: string) => React.ReactNode;
}

export default function ParentChain({
  childEvent,
  isTop = true,
  expandedParents,
  onParentToggle,
  onAuthorClick,
  renderContentWithClickableHashtags,
  renderNoteMedia
}: ParentChainProps) {
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

  const parentId = getReplyToEventId(childEvent);
  if (!parentId) return null;
  
  const parentState = expandedParents[parentId];
  const isLoading = parentState === 'loading';
  const parentEvent = parentState && parentState !== 'loading' ? (parentState as NDKEvent) : null;

  const handleToggle = async () => {
    if (expandedParents[parentId]) {
      onParentToggle(parentId, null);
      return;
    }
    onParentToggle(parentId, 'loading');
    const fetched = await fetchEventById(parentId);
    onParentToggle(parentId, fetched || 'loading');
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
        <div className="flex items-center justify-between w-full">
          <button type="button" onClick={handleToggle} className="flex-1 text-left flex items-center gap-2">
            {isLoading ? (
              'Loading parent…'
            ) : (
              <>
                <FontAwesomeIcon icon={faReply} className="text-xs text-gray-400" />
                <span>{parentLabel}</span>
              </>
            )}
          </button>
          <RelayIndicator event={childEvent} className="ml-2" />
        </div>
      </div>
    );
  }

  return (
    <>
      <ParentChain
        childEvent={parentEvent}
        isTop={isTop}
        expandedParents={expandedParents}
        onParentToggle={onParentToggle}
        onAuthorClick={onAuthorClick}
        renderContentWithClickableHashtags={renderContentWithClickableHashtags}
        renderNoteMedia={renderNoteMedia}
      />
      <div className={`${isTop ? 'rounded-t-lg' : 'rounded-none border-t-0'} rounded-b-none border-b-0 p-4 bg-[#2d2d2d] border border-[#3d3d3d]`}>
        <EventCard
          event={parentEvent}
          onAuthorClick={onAuthorClick}
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
}
