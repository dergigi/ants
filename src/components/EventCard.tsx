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
import { parseHighlightEvent, formatHighlightContent, HIGHLIGHTS_KIND } from '@/lib/highlights';
import { compareTwoStrings } from 'string-similarity';
import { isAbsoluteHttpUrl } from '@/lib/urlPatterns';
import UrlPreview from '@/components/UrlPreview';
import { shortenNevent, shortenNpub } from '@/lib/utils';
import { nip19 } from 'nostr-tools';


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

  // Check if this is a highlight event
  const isHighlight = event.kind === HIGHLIGHTS_KIND;
  const highlight = isHighlight ? parseHighlightEvent(event) : null;

  const normalizeForSimilarity = (value?: string) => (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  const contextSimilarity = highlight?.context
    ? compareTwoStrings(
        normalizeForSimilarity(highlight.content),
        normalizeForSimilarity(highlight.context)
      )
    : 0;
  const shouldShowHighlightContext = Boolean(highlight?.context && contextSimilarity < 0.9);

  const highlightLinks = () => {
    if (!highlight) return null;
    const items: React.ReactNode[] = [];

    if (highlight.referencedEvent) {
      items.push(
        <a
          key="hl-event"
          href={`https://njump.me/${highlight.referencedEvent}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 hover:underline"
        >
          {`Event ${shortenNevent(highlight.referencedEvent)}`}
        </a>
      );
    }

    if (highlight.referencedAuthorHex) {
      const npub = highlight.referencedAuthor || (() => {
        try { return nip19.npubEncode(highlight.referencedAuthorHex!); } catch { return highlight.referencedAuthorHex!; }
      })();
      items.push(
        <a
          key="hl-author"
          href={`https://njump.me/${npub}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 hover:underline"
        >
          {`Author ${shortenNpub(npub)}`}
        </a>
      );
    }

    return items.length > 0 ? (
      <div className="flex flex-wrap gap-2 text-xs text-gray-300">
        {items.map((item, idx) => (
          <span key={`hl-link-${idx}`}>{item}</span>
        ))}
      </div>
    ) : null;
  };

  // Helper function to render metadata items
  const renderMetadataItem = (label: string, value: string, type: 'text' | 'button' | 'link' = 'text', onClick?: () => void, href?: string) => {
    if (!value) return null;
    
    const linkClasses = "text-blue-400 hover:text-blue-300 hover:underline";
    
    const content = type === 'button' ? (
      <button onClick={onClick} className={linkClasses}>
        {value}
      </button>
    ) : type === 'link' ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkClasses}>
        {value}
      </a>
    ) : (
      <span>{value}</span>
    );

    return (
      <div>
        <span className="font-medium">{label}:</span>{' '}
        {content}
      </div>
    );
  };

  return (
    <div className={containerClasses}>
      {showRaw ? (
        <div className="mt-0">
          <RawEventJson event={event} />
        </div>
      ) : (
        <>
          {isHighlight && highlight ? (
            <div className="mb-3 space-y-3">
              {/* Context if available, rendered like regular content */}
              {shouldShowHighlightContext && (
                <div className={contentClasses}>
                  {renderContent(highlight.context)}
                </div>
              )}

              {/* Highlighted excerpt styled similar to native reader highlights */}
              <div className={contentClasses}>
                <span
                  className="inline rounded-[2px] bg-[#f6de74]/30 px-1 py-[1px] text-gray-100 shadow-[0_1px_4px_rgba(246,222,116,0.15)] border-b-2 border-[#f6de74]"
                  style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
                >
                  {shouldShowHighlightContext ? formatHighlightContent(highlight) : highlight.content}
                </span>
              </div>

              {/* Additional highlight metadata as part of content */}
              <div className="text-xs text-gray-400 space-y-1">
                {renderMetadataItem("Event", highlight.referencedEvent || '')}
                {renderMetadataItem("Author", highlight.referencedAuthorHex || '')}
                {renderMetadataItem("Range", highlight.range || '')}
              </div>

              {highlightLinks()}

              {highlight.referencedUrl ? (
                <div className="space-y-2">
                  {isAbsoluteHttpUrl(highlight.referencedUrl) ? (
                    <UrlPreview url={highlight.referencedUrl} />
                  ) : (
                    <div className={contentClasses}>
                      {renderContent(highlight.referencedUrl)}
                    </div>
                  )}
                </div>
              ) : null}
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


