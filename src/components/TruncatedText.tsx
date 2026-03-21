import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { extractNip19Identifiers } from '@/lib/utils/nostrIdentifiers';
import { TEXT_MAX_LENGTH, TEXT_LINK_CHAR_COUNT } from '@/lib/constants';

interface TruncatedTextProps {
  content: string;
  maxLength?: number;
  className?: string;
  searchTerms?: string[];
  renderContentWithClickableHashtags: (content: string, options?: { disableNevent?: boolean; skipIdentifierIds?: Set<string> }) => React.ReactNode;
}

export default function TruncatedText({
  content,
  maxLength = TEXT_MAX_LENGTH,
  className = '',
  searchTerms,
  renderContentWithClickableHashtags
}: TruncatedTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!content) return null;
  
  // Calculate effective length considering links as 10 characters each
  const calculateEffectiveLength = (text: string): number => {
    // Regex patterns for different types of links
    const urlPattern = /https?:\/\/[^\s]+/g;

    let effectiveLength = text.length;

    const urls = text.match(urlPattern) || [];
    urls.forEach(url => {
      effectiveLength = effectiveLength - url.length + TEXT_LINK_CHAR_COUNT;

      const nestedIdentifiers = extractNip19Identifiers(url);
      nestedIdentifiers.forEach(identifier => {
        effectiveLength = effectiveLength - identifier.length + TEXT_LINK_CHAR_COUNT;
      });
    });

    const directIdentifiers = extractNip19Identifiers(text);
    directIdentifiers.forEach(identifier => {
      const alreadyCovered = urls.some(url => url.includes(identifier));
      if (alreadyCovered) return;
      effectiveLength = effectiveLength - identifier.length + TEXT_LINK_CHAR_COUNT;
    });

    return effectiveLength;
  };
  
  const effectiveLength = calculateEffectiveLength(content);
  const shouldTruncate = effectiveLength > maxLength;
  
  // For display, find the best snippet to show when truncated.
  // If search terms exist and the first match is beyond the truncation window,
  // center the snippet around the match so the highlighted term is visible.
  const getDisplayText = (): { text: string; isSnippet: boolean } => {
    if (isExpanded || !shouldTruncate) return { text: content, isSnippet: false };

    if (searchTerms?.length) {
      const lowerContent = content.toLowerCase();
      let firstMatchIdx = -1;
      for (const term of searchTerms) {
        const idx = lowerContent.indexOf(term.toLowerCase());
        if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
          firstMatchIdx = idx;
        }
      }
      // If match is beyond the default truncation window, show a snippet around it
      if (firstMatchIdx > maxLength) {
        const contextBefore = Math.floor(maxLength * 0.3);
        const start = Math.max(0, firstMatchIdx - contextBefore);
        const text = content.slice(start, start + maxLength);
        return { text, isSnippet: start > 0 };
      }
    }

    return { text: content.slice(0, maxLength), isSnippet: false };
  };

  const { text: displayText, isSnippet } = getDisplayText();

  return (
    <div className={`relative ${className}`}>
      <div className={shouldTruncate && !isExpanded ? 'relative' : ''}>
        {isSnippet && !isExpanded && <span className="text-gray-400">…&nbsp;</span>}
        {renderContentWithClickableHashtags(displayText)}
        {shouldTruncate && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#2d2d2d] to-transparent pointer-events-none" />
        )}
      </div>
      {shouldTruncate && (
        <div className="mt-0.5">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
          >
            <FontAwesomeIcon 
              icon={isExpanded ? faChevronUp : faChevronDown} 
              className="w-3 h-3" 
            />
          </button>
        </div>
      )}
    </div>
  );
}
