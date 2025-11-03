'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpWideShort } from '@fortawesome/free-solid-svg-icons';

export type SortOrder = 'newest' | 'oldest';

interface SortCollapsedProps {
  sortOrder: SortOrder;
  onToggle: () => void;
}

export default function SortCollapsed({
  sortOrder,
  onToggle
}: SortCollapsedProps) {
  const sortLabel = sortOrder === 'newest' ? 'Newest first' : 'Oldest first';
  
  return (
    <button
      type="button"
      className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
      onClick={onToggle}
      title={`Toggle sort order: ${sortLabel}`}
    >
      <FontAwesomeIcon 
        icon={faArrowUpWideShort} 
        className="w-3 h-3 text-gray-500" 
      />
      <span className="text-xs text-gray-400">
        {sortLabel}
      </span>
    </button>
  );
}

