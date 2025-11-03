'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpWideShort, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

export type SortOrder = 'newest' | 'oldest';

interface SortCollapsedProps {
  sortOrder: SortOrder;
  onExpand: () => void;
  isExpanded?: boolean;
}

export default function SortCollapsed({
  sortOrder,
  onExpand,
  isExpanded = false
}: SortCollapsedProps) {
  const sortLabel = sortOrder === 'newest' ? 'Newest' : 'Oldest';
  
  return (
    <button
      type="button"
      className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
      onClick={onExpand}
    >
      <FontAwesomeIcon 
        icon={faArrowUpWideShort} 
        className="w-3 h-3 text-gray-500" 
      />
      <span className="text-xs text-gray-400">
        {sortLabel}
      </span>
      <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} className="w-3 h-3" />
    </button>
  );
}

