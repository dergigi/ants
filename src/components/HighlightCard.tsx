'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { parseHighlightEvent, formatHighlightContent, getHighlightMetadata } from '@/lib/highlights';
import { nip19 } from 'nostr-tools';
import { useState } from 'react';

interface HighlightCardProps {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  className?: string;
}

export default function HighlightCard({ event, onAuthorClick, className = '' }: HighlightCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  const highlight = parseHighlightEvent(event);
  if (!highlight) {
    return null;
  }

  const metadata = getHighlightMetadata(highlight);
  const formattedContent = formatHighlightContent(highlight);

  const handleAuthorClick = () => {
    if (onAuthorClick && event.author?.pubkey) {
      const npub = nip19.npubEncode(event.author.pubkey);
      onAuthorClick(npub);
    }
  };

  return (
    <div className={`bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-4 ${className}`}>
      {/* Highlight content */}
      <div className="mb-3">
        <div className="bg-[#1a1a1a] border border-[#4a4a4a] rounded-md p-3 mb-2">
          <div className="text-yellow-200 text-sm font-medium mb-1">💡 Highlight</div>
          <div className="text-gray-100 whitespace-pre-wrap break-words">
            {formattedContent}
          </div>
        </div>
        
        {/* Context if available */}
        {highlight.context && (
          <div className="text-xs text-gray-400 mb-2">
            <span className="font-medium">Context:</span> {highlight.context}
          </div>
        )}
      </div>

      {/* Metadata and details */}
      <div className="flex items-center justify-between text-xs text-gray-300">
        <div className="flex items-center gap-3">
          {/* Author */}
          <button
            onClick={handleAuthorClick}
            className="hover:text-blue-400 transition-colors"
          >
            {event.author?.profile?.displayName || event.author?.profile?.name || 'Anonymous'}
          </button>
          
          {/* Metadata indicators */}
          {metadata.hasReferences && (
            <span className="text-blue-400">
              {metadata.referenceCount} reference{metadata.referenceCount !== 1 ? 's' : ''}
            </span>
          )}
          
          {metadata.hasRange && (
            <span className="text-green-400">Range: {highlight.range}</span>
          )}
        </div>

        {/* Toggle details */}
        {(metadata.hasReferences || highlight.referencedEvent || highlight.referencedAuthor || highlight.referencedUrl) && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            {showDetails ? 'Hide' : 'Show'} details
          </button>
        )}
      </div>

      {/* Detailed information */}
      {showDetails && (
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
    </div>
  );
}
