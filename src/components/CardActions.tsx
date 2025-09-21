'use client';

import React, { forwardRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCode, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { nip19 } from 'nostr-tools';
import IconButton from '@/components/IconButton';

type Props = {
  eventId?: string;
  showRaw: boolean;
  onToggleRaw: () => void;
  onToggleMenu: () => void;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
};

const CardActions = forwardRef<HTMLDivElement, Props>(function CardActions(
  { eventId, showRaw, onToggleRaw, onToggleMenu, menuButtonRef, className }: Props,
  ref
) {
  if (!eventId) return null;

  return (
    <div ref={ref} className={`flex items-center gap-2 ${className || ''}`.trim()}>
      <IconButton
        title={showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
        ariaLabel="Toggle raw JSON"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleRaw(); }}
      >
        <FontAwesomeIcon icon={faCode} className="text-xs" />
      </IconButton>
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
      <a
        href={`nostr:${nip19.neventEncode({ id: eventId })}`}
        title="Open in native client"
        className="text-gray-400 hover:text-gray-200"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
      </a>
    </div>
  );
});

export default CardActions;
