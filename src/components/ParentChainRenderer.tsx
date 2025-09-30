'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import EventCard from '@/components/EventCard';
import TruncatedText from '@/components/TruncatedText';
import { TEXT_MAX_LENGTH } from '@/lib/constants';

interface ParentChainRendererProps {
  parentEvent: NDKEvent;
  onAuthorClick: (npub: string) => void;
  renderContentWithClickableHashtags: (content: string, options?: { disableNevent?: boolean; skipIdentifierIds?: Set<string> }) => React.ReactNode;
  renderNoteMedia: (content: string) => React.ReactNode;
  className?: string;
}

export default function ParentChainRenderer({
  parentEvent,
  onAuthorClick,
  renderContentWithClickableHashtags,
  renderNoteMedia,
  className = ''
}: ParentChainRendererProps) {
  return (
    <div className={`p-4 bg-[#2d2d2d] border border-[#3d3d3d] rounded-b-lg border-t-0 ${className}`}>
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
  );
}
