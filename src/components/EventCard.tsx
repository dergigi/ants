'use client';

import React, { useRef, useState } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { createEventExplorerItems } from '@/lib/portals';
import { calculateAbsoluteMenuPosition } from '@/lib/utils';
import RawEventJson from '@/components/RawEventJson';
import CardActions from '@/components/CardActions';
import Nip05Display from '@/components/Nip05Display';
import FollowPackCard from '@/components/FollowPackCard';
import EventCardHighlight, { navigateToSearch } from '@/components/EventCardHighlight';
import ExplorerPortalMenu, { type ExplorerMenuItem } from '@/components/ExplorerPortalMenu';
import { parseHighlightEvent, HIGHLIGHTS_KIND } from '@/lib/highlights';
import { parseFollowPackTags } from '@/lib/followPack';
import { FOLLOW_PACK_KIND } from '@/lib/constants';
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

  const contentClasses = 'text-gray-100 whitespace-pre-wrap break-words';

  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const portalButtonRef = useRef<HTMLButtonElement>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Check if this is a highlight event
  const isHighlight = event.kind === HIGHLIGHTS_KIND;
  const highlight = isHighlight ? parseHighlightEvent(event) : null;

  // Check if this is a follow pack event
  const isFollowPack = event.kind === FOLLOW_PACK_KIND;
  const followPack = isFollowPack ? parseFollowPackTags(event) : null;

  const buildMenuItems = (): { portalItems: ExplorerMenuItem[]; clientItems: ExplorerMenuItem[] } => {
    const nevent = nip19.neventEncode({ id: event.id });
    const items = createEventExplorerItems(nevent);
    const portalItems: ExplorerMenuItem[] = items.slice(0, -2); // All items except last two
    const clientItems: ExplorerMenuItem[] = items.slice(-2); // Last two items (Web Client, Native App)

    // Special handling for follow packs: add Following._ link
    if (isFollowPack) {
      let dTag: string | undefined;
      if (typeof (event as unknown as { tagValue?: (name: string) => string | undefined }).tagValue === 'function') {
        dTag = (event as unknown as { tagValue?: (name: string) => string | undefined }).tagValue?.('d');
      } else {
        const dTagEntry = event.tags.find(
          (t) => Array.isArray(t) && t[0] === 'd' && typeof t[1] === 'string'
        );
        dTag = dTagEntry ? (dTagEntry[1] as string) : undefined;
      }

      const creatorPubkey = event.pubkey;

      if (dTag && creatorPubkey) {
        portalItems.unshift({
          name: 'following.space',
          href: `https://following.space/d/${encodeURIComponent(dTag)}?p=${creatorPubkey}`,
          dividerAfter: true
        });
      }
    }

    return { portalItems, clientItems };
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
            <EventCardHighlight
              highlight={highlight}
              contentClasses={contentClasses}
              renderContent={renderContent}
              onAuthorClick={onAuthorClick}
            />
          ) : isFollowPack && followPack ? (
              <FollowPackCard
              followPack={followPack}
              onExploreClick={() => {
                const query = followPack.memberPubkeys
                  .map((p) => `by:${p}`)
                  .join(' OR ');
                if (query) {
                  navigateToSearch(query);
                }
              }}
              renderContent={renderContent}
            />
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

      {showPortalMenu && event?.id && (() => {
        const { portalItems, clientItems } = buildMenuItems();
        return (
          <ExplorerPortalMenu
            position={menuPosition}
            onClose={() => setShowPortalMenu(false)}
            portalItems={portalItems}
            clientItems={clientItems}
            showRaw={showRaw}
            onToggleRaw={() => setShowRaw(v => !v)}
          />
        );
      })()}
    </div>
  );
}
