'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faArrowDownWideShort, faArrowDownShortWide } from '@fortawesome/free-solid-svg-icons';

export type SortOrder = 'newest' | 'oldest';

interface SortCollapsedProps {
  sortOrder: SortOrder;
  onToggle: () => void;
}

export default function SortCollapsed({
  sortOrder,
  onToggle
}: SortCollapsedProps) {
  const sortIcon = sortOrder === 'newest' ? faArrowDownWideShort : faArrowDownShortWide;
  const tooltip = sortOrder === 'newest' ? 'Showing newest first' : 'Showing oldest first';
  
  return (
    <button
      type="button"
      className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
      onClick={onToggle}
      title={tooltip}
    >
      <FontAwesomeIcon 
        icon={faClock} 
        className="w-3 h-3 text-gray-500" 
      />
      <FontAwesomeIcon 
        icon={sortIcon} 
        className="w-3 h-3 text-gray-500" 
      />
    </button>
  );
}

