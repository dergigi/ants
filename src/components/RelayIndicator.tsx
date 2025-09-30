'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHardDrive } from '@fortawesome/free-solid-svg-icons';
import { NDKEvent } from '@nostr-dev-kit/ndk';
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
    ? `From: ${relaySources[0]}`
    : `From ${relaySources.length} relays:\n${relaySources.join('\n')}`;

  return (
    <div 
      className={`inline-flex items-center ${className}`}
      title={tooltipText}
    >
      <FontAwesomeIcon 
        icon={faHardDrive} 
        className="text-xs text-gray-400 hover:text-gray-300 transition-colors" 
      />
    </div>
  );
}