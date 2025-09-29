'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEquals, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

interface QueryTranslationProps {
  translation: string;
}

export default function QueryTranslation({ translation }: QueryTranslationProps) {
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);

  if (!translation) return null;

  const isLongTranslation = translation.split('\n').length > 4;

  return (
    <div 
      id="search-explanation" 
      className={`mt-1 text-[11px] text-gray-400 font-mono break-all whitespace-pre-wrap flex items-start gap-2 ${
        isLongTranslation ? 'cursor-pointer hover:bg-gray-800/20 rounded px-1 py-0.5 -mx-1 -my-0.5' : ''
      }`}
      onClick={() => {
        if (isLongTranslation) {
          setIsExplanationExpanded(!isExplanationExpanded);
        }
      }}
    >
      <FontAwesomeIcon icon={faEquals} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {isLongTranslation && !isExplanationExpanded ? (
          <>
            <div className="overflow-hidden" style={{ 
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical'
            }}>
              {translation.split('\n').slice(0, 4).join('\n')}
            </div>
            <div className="flex items-center justify-center mt-1 text-gray-500">
              <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
            </div>
          </>
        ) : (
          <>
            <span>{translation}</span>
            {isLongTranslation && (
              <div className="flex items-center justify-center mt-1 text-gray-500">
                <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
