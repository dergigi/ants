import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { extractNip19Identifiers } from '@/lib/utils/nostrIdentifiers';
import { TEXT_MAX_LENGTH, TEXT_LINK_CHAR_COUNT } from '@/lib/constants';

interface TruncatedTextProps {
  content: string;
  maxLength?: number;
  className?: string;
  renderContentWithClickableHashtags: (content: string, options?: { disableNevent?: boolean; skipIdentifierIds?: Set<string> }) => React.ReactNode;
}

export default function TruncatedText({ 
  content, 
  maxLength = TEXT_MAX_LENGTH, 
  className = '',
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
  
  // For display, we still need to truncate the actual text
  const displayText = isExpanded || !shouldTruncate ? content : content.slice(0, maxLength);
  
  return (
    <div className={`relative ${className}`}>
      <div className={shouldTruncate && !isExpanded ? 'relative' : ''}>
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
