'use client';

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHardDrive } from '@fortawesome/free-solid-svg-icons';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { extractRelaySourcesFromEvent } from '@/lib/urlUtils';

interface RelayIndicatorProps {
  event: NDKEvent;
  className?: string;
}

export default function RelayIndicator({ event, className = '' }: RelayIndicatorProps) {
  const relaySources = extractRelaySourcesFromEvent(event);
  
  if (relaySources.length === 0) {
    return null;
  }

  const tooltipText = relaySources.length === 1 
    ? relaySources[0]
    : `${relaySources.length} relays:\n${relaySources.join('\n')}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (event.id) {
      const nevent = nip19.neventEncode({ id: event.id });
      window.open(`https://njump.to/${nevent}`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center cursor-pointer ${className}`}
      title={`${tooltipText}\nClick to open on njump.to`}
    >
      <FontAwesomeIcon 
        icon={faHardDrive} 
        className="text-xs text-gray-400 hover:text-gray-300 transition-colors" 
      />
    </button>
  );
}