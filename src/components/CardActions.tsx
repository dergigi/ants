'use client';

import React, { forwardRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCode, faArrowUpRightFromSquare, faCopy } from '@fortawesome/free-solid-svg-icons';
import { nip19 } from 'nostr-tools';
import IconButton from '@/components/IconButton';

type Props = {
  eventId?: string;
  profilePubkey?: string;
  showRaw: boolean;
  onToggleRaw: () => void;
  onToggleMenu?: () => void;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
  externalHref?: string;
  externalTitle?: string;
  externalTarget?: '_blank' | '_self' | '_parent' | '_top';
  externalRel?: string;
  onExternalClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

const CardActions = forwardRef<HTMLDivElement, Props>(function CardActions(
  {
    eventId,
    profilePubkey,
    showRaw,
    onToggleRaw,
    onToggleMenu,
    menuButtonRef,
    className,
    externalHref,
    externalTitle,
    externalTarget,
    externalRel,
    onExternalClick,
  }: Props,
  ref
) {
  const neventHref = eventId ? `nostr:${nip19.neventEncode({ id: eventId })}` : undefined;
  const nprofile = profilePubkey ? nip19.nprofileEncode({ pubkey: profilePubkey }) : undefined;
  const fallbackTitle = eventId ? 'Open in native client' : 'Open external';
  const href = externalHref || neventHref;
  const title = externalTitle || fallbackTitle;
  const target = externalTarget || (href && href.startsWith('http') ? '_blank' : undefined);
  const rel = externalRel || (target === '_blank' ? 'noopener noreferrer' : undefined);

  const isMenuVisible = typeof onToggleMenu === 'function';

  return (
    <div ref={ref} className={`flex items-center gap-2 ${className || ''}`.trim()}>
      <IconButton
        title={showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
        ariaLabel="Toggle raw JSON"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleRaw(); }}
      >
        <FontAwesomeIcon icon={faCode} className="text-xs" />
      </IconButton>
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
      {nprofile ? (
        <IconButton
          title="Copy nprofile"
          ariaLabel="Copy nprofile"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { void navigator.clipboard.writeText(`nostr:${nprofile}`); } catch {} }}
        >
          <FontAwesomeIcon icon={faCopy} className="text-xs" />
        </IconButton>
      ) : null}
      {eventId ? (
        <IconButton
          title="Copy nevent"
          ariaLabel="Copy nevent"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { void navigator.clipboard.writeText(String(neventHref)); } catch {} }}
        >
          <FontAwesomeIcon icon={faCopy} className="text-xs" />
        </IconButton>
      ) : null}
      {href ? (
        <a
          href={href}
          title={title}
          className="text-gray-400 hover:text-gray-200"
          target={target}
          rel={rel}
          onClick={(e) => {
            e.stopPropagation();
            if (onExternalClick) onExternalClick(e);
          }}
        >
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
        </a>
      ) : null}
    </div>
  );
});

export default CardActions;
