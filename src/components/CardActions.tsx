'use client';

import React, { forwardRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMobileScreenButton, faExternalLink } from '@fortawesome/free-solid-svg-icons';
import { nip19 } from 'nostr-tools';
import IconButton from '@/components/IconButton';
import CopyButton from '@/components/CopyButton';

type Props = {
  eventId?: string;
  profilePubkey?: string;
  eventKind?: number;
  nostrId?: string;
  copyTitle?: string;
  secondaryCopyText?: string;
  secondaryCopyTitle?: string;
  onToggleMenu?: () => void;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
  externalHref?: string;
  externalTitle?: string;
  externalTarget?: '_blank' | '_self' | '_parent' | '_top';
  onExternalClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

const CardActions = forwardRef<HTMLDivElement, Props>(function CardActions(
  {
    eventId,
    profilePubkey,
    eventKind,
    nostrId,
    copyTitle,
    secondaryCopyText,
    secondaryCopyTitle,
    onToggleMenu,
    menuButtonRef,
    className,
    externalHref,
    externalTitle,
    externalTarget,
    onExternalClick,
  }: Props,
  ref
) {
  const encodedEventId = eventId ? nip19.neventEncode({ id: eventId }) : undefined;
  const nprofile = profilePubkey ? nip19.nprofileEncode({ pubkey: profilePubkey }) : undefined;
  const defaultNostrId = eventKind === 0 ? nprofile : (nostrId || encodedEventId);
  const copyText = defaultNostrId ? `nostr:${defaultNostrId}` : undefined;
  const fallbackTitle = eventId ? 'Open in native client' : 'Open external';
  const href = externalHref || (defaultNostrId ? `nostr:${defaultNostrId}` : undefined);
  const title = externalTitle || fallbackTitle;
  const target = externalTarget || (href && href.startsWith('http') ? '_blank' : undefined);

  const isMenuVisible = typeof onToggleMenu === 'function';

  return (
    <div ref={ref} className={`flex items-center gap-2 ${className || ''}`.trim()}>
      {copyText ? (
        <CopyButton
          text={copyText}
          title={copyTitle || (eventKind === 0 ? 'Copy nprofile' : 'Copy nevent')}
          className="border-0 text-gray-300 hover:bg-[#3a3a3a]"
        />
      ) : null}
      {secondaryCopyText ? (
        <CopyButton
          text={secondaryCopyText}
          title={secondaryCopyTitle || 'Copy'}
          className="border-0 text-gray-300 hover:bg-[#3a3a3a]"
        />
      ) : null}
      {href ? (
        <IconButton
          title={title}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onExternalClick) onExternalClick(e as unknown as React.MouseEvent<HTMLAnchorElement>);
            if (href) {
              if (target === '_blank') {
                window.open(href, '_blank', 'noopener,noreferrer');
              } else {
                window.location.href = href;
              }
            }
          }}
        >
          <FontAwesomeIcon icon={faMobileScreenButton} className="text-xs" />
        </IconButton>
      ) : null}
      {defaultNostrId ? (
        <IconButton
          title="Open with njump.to"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const njumpUrl = defaultNostrId ? `https://njump.to/${defaultNostrId}` : null;
            if (njumpUrl) {
              window.open(njumpUrl, '_blank', 'noopener,noreferrer');
            }
          }}
        >
          <FontAwesomeIcon icon={faExternalLink} className="text-xs" />
        </IconButton>
      ) : null}
      {isMenuVisible ? (
        <IconButton
          ref={menuButtonRef}
          title="Open in portals"
          ariaLabel="Open in portals"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleMenu();
          }}
        >
          ⋯
        </IconButton>
      ) : null}
    </div>
  );
});

export default CardActions;
