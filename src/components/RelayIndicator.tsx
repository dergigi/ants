'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHardDrive } from '@fortawesome/free-solid-svg-icons';
import { NDKEvent } from '@nostr-dev-kit/ndk';

interface RelayIndicatorProps {
  event: NDKEvent;
  className?: string;
}

export default function RelayIndicator({ event, className = '' }: RelayIndicatorProps) {
  // Extract relay sources from the event
  const getRelaySources = (event: NDKEvent): string[] => {
    const eventWithSources = event as NDKEvent & {
      relaySource?: string;
      relaySources?: string[];
    };
    
    if (Array.isArray(eventWithSources.relaySources)) {
      return eventWithSources.relaySources.filter((url): url is string => typeof url === 'string');
    }
    if (typeof eventWithSources.relaySource === 'string') {
      return [eventWithSources.relaySource];
    }
    return [];
  };

  const relaySources = getRelaySources(event);
  
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