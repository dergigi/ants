'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCode } from '@fortawesome/free-solid-svg-icons';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createEventExplorerItems } from '@/lib/portals';
import RawEventJson from '@/components/RawEventJson';
import IconButton from '@/components/IconButton';

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

  return (
    <div className={containerClasses}>
      {showRaw ? (
        <div className="mt-0">
          <RawEventJson event={event} />
        </div>
      ) : (
        <>
          <div className={contentClasses}>{renderContent(event.content || '')}</div>
          {variant !== 'inline' && mediaRenderer ? mediaRenderer(event.content || '') : null}
        </>
      )}
      {showFooter && (
        <div className={variant === 'inline' ? 'text-xs text-gray-300 pt-1 border-t border-[#3d3d3d] flex items-center justify-between gap-2' : 'mt-4 text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] -mx-4 -mb-4 px-4 py-2 flex items-center justify-between gap-2 flex-wrap rounded-b-lg'}>
          <div className="flex items-center gap-2">
            <AuthorBadge user={event.author} onAuthorClick={onAuthorClick} />
          </div>
          {footerRight ? (
            <div className="flex items-center gap-2">
              {footerRight}
              {event?.id ? (
                <>
                  
                  <IconButton
                    title={showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
                    ariaLabel="Toggle raw JSON"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRaw(v => !v); }}
                  >
                    <FontAwesomeIcon icon={faCode} className="text-xs" />
                  </IconButton>
                  <IconButton
                    ref={portalButtonRef}
                    title="Open in portals"
                    ariaLabel="Open in portals"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (portalButtonRef.current) {
                        const rect = portalButtonRef.current.getBoundingClientRect();
                        setMenuPosition({ top: rect.bottom + 4, left: rect.left });
                      }
                      setShowPortalMenu((v) => !v);
                    }}
                  >
                    ⋯
                  </IconButton>
                  <a
                    href={`nostr:${nip19.neventEncode({ id: event.id })}`}
                    title="Open in native client"
                    className="text-gray-400 hover:text-gray-200"
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
                  </a>
                </>
              ) : null}
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
            className="fixed z-[9999] w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
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


