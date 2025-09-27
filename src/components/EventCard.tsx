'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createEventExplorerItems } from '@/lib/portals';
import { calculateAbsoluteMenuPosition } from '@/lib/utils';
import RawEventJson from '@/components/RawEventJson';
import CardActions from '@/components/CardActions';
import Nip05Display from '@/components/Nip05Display';
import { parseHighlightEvent, formatHighlightContent, getHighlightMetadata, HIGHLIGHTS_KIND } from '@/lib/highlights';


type Props = {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  renderContent: (content: string) => React.ReactNode;
  variant?: 'card' | 'inline';
  mediaRenderer?: (content: string) => React.ReactNode;
  footerRight?: React.ReactNode;
  className?: string;
  showFooter?: boolean;
};

// No local media helpers; media should be rendered by the provided mediaRenderer prop to keep this component generic.

export default function EventCard({ event, onAuthorClick, renderContent, variant = 'card', mediaRenderer, footerRight, className, showFooter = true }: Props) {
  const baseContainerClasses = variant === 'inline'
    ? 'flex w-full max-w-full flex-col gap-1 px-3 py-2 rounded-md bg-[#1f1f1f] border border-[#3d3d3d]'
    : 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg';
  const containerClasses = className ? `${baseContainerClasses} ${className}` : baseContainerClasses;

  const contentClasses = variant === 'inline'
    ? 'text-gray-100 whitespace-pre-wrap break-words'
    : 'text-gray-100 whitespace-pre-wrap break-words';

  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const portalButtonRef = useRef<HTMLButtonElement>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showHighlightDetails, setShowHighlightDetails] = useState(false);

  // Check if this is a highlight event
  const isHighlight = event.kind === HIGHLIGHTS_KIND;
  const highlight = isHighlight ? parseHighlightEvent(event) : null;
  const highlightMetadata = highlight ? getHighlightMetadata(highlight) : null;

  return (
    <div className={containerClasses}>
      {showRaw ? (
        <div className="mt-0">
          <RawEventJson event={event} />
        </div>
      ) : (
        <>
          {isHighlight && highlight ? (
            <div className="mb-3">
              <div className="bg-[#1a1a1a] border border-[#4a4a4a] rounded-md p-3 mb-2">
                <div className="text-yellow-200 text-sm font-medium mb-1">💡 Highlight</div>
                <div className="text-gray-100 whitespace-pre-wrap break-words">
                  {formatHighlightContent(highlight)}
                </div>
              </div>
              
              {/* Context if available */}
              {highlight.context && (
                <div className="text-xs text-gray-400 mb-2">
                  <span className="font-medium">Context:</span> {highlight.context}
                </div>
              )}
            </div>
          ) : (
            <div className={contentClasses}>{renderContent(event.content || '')}</div>
          )}
          {variant !== 'inline' && mediaRenderer ? mediaRenderer(event.content || '') : null}
        </>
      )}
      {showFooter && (
        <div className={variant === 'inline' ? 'text-xs text-gray-300 pt-1 border-t border-[#3d3d3d] flex items-center justify-between gap-2' : 'mt-4 text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] -mx-4 -mb-4 px-4 py-2 flex items-center gap-3 flex-wrap rounded-b-lg'}>
          <div className="flex items-center gap-2 min-h-[1rem]">
            {event.author && <Nip05Display user={event.author} compact={true} />}
            <AuthorBadge user={event.author} onAuthorClick={onAuthorClick} />
            
            {/* Highlight metadata indicators */}
            {isHighlight && highlightMetadata && (
              <>
                {highlightMetadata.hasReferences && (
                  <span className="text-blue-400">
                    {highlightMetadata.referenceCount} reference{highlightMetadata.referenceCount !== 1 ? 's' : ''}
                  </span>
                )}
                {highlightMetadata.hasRange && highlight && (
                  <span className="text-green-400">Range: {highlight.range}</span>
                )}
              </>
            )}
          </div>
          {footerRight ? (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2">
                {footerRight}
                <CardActions
                  eventId={event?.id}
                  profilePubkey={event?.author?.pubkey}
                  eventKind={event?.kind}
                  showRaw={showRaw}
                  onToggleRaw={() => setShowRaw(v => !v)}
                  onToggleMenu={() => {
                    if (portalButtonRef.current) {
                      const rect = portalButtonRef.current.getBoundingClientRect();
                      const position = calculateAbsoluteMenuPosition(rect);
                      setMenuPosition(position);
                    }
                    setShowPortalMenu((v) => !v);
                  }}
                  menuButtonRef={portalButtonRef}
                />
              </div>
            </div>
          ) : null}
          
          {/* Highlight details toggle */}
          {isHighlight && highlight && (highlightMetadata?.hasReferences || highlight.referencedEvent || highlight.referencedAuthor || highlight.referencedUrl) && (
            <div className="ml-auto">
              <button
                onClick={() => setShowHighlightDetails(!showHighlightDetails)}
                className="text-gray-400 hover:text-gray-200 transition-colors text-xs"
              >
                {showHighlightDetails ? 'Hide' : 'Show'} details
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Detailed highlight information */}
      {isHighlight && highlight && showHighlightDetails && (
        <div className="mt-3 pt-3 border-t border-[#3d3d3d] text-xs text-gray-400">
          {highlight.referencedEvent && (
            <div className="mb-1">
              <span className="font-medium">Event:</span> {highlight.referencedEvent}
            </div>
          )}
          {highlight.referencedAuthor && (
            <div className="mb-1">
              <span className="font-medium">Author:</span> {highlight.referencedAuthor}
            </div>
          )}
          {highlight.referencedUrl && (
            <div className="mb-1">
              <span className="font-medium">URL:</span>{' '}
              <a 
                href={highlight.referencedUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                {highlight.referencedUrl}
              </a>
            </div>
          )}
        </div>
      )}
      
      {showPortalMenu && typeof window !== 'undefined' && event?.id && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => { e.preventDefault(); setShowPortalMenu(false); }}
          />
          <div
            className="absolute z-[9999] w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <ul className="py-1 text-sm text-gray-200">
              {(() => {
                const nevent = nip19.neventEncode({ id: event.id });
                const items = createEventExplorerItems(nevent);
                return items.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      target={item.href.startsWith('http') ? '_blank' : undefined}
                      rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="px-3 py-2 hover:bg-[#3a3a3a] flex items-center justify-between"
                      onClick={(e) => { e.stopPropagation(); setShowPortalMenu(false); }}
                    >
                      <span>{item.name}</span>
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-gray-400 text-xs" />
                    </a>
                  </li>
                ));
              })()}
            </ul>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}


