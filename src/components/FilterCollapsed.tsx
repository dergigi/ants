'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faChevronDown } from '@fortawesome/free-solid-svg-icons';

interface FilterCollapsedProps {
  filtersAreActive: boolean;
  hasActiveFilters: boolean;
  filteredCount: number;
  resultCount: number;
  onExpand: () => void;
}

export default function FilterCollapsed({
  filtersAreActive,
  hasActiveFilters,
  filteredCount,
  resultCount,
  onExpand
}: FilterCollapsedProps) {
  return (
    <button
      onClick={onExpand}
      className={`flex items-center gap-2 text-sm transition-colors ${
        filtersAreActive 
          ? 'text-blue-400 hover:text-blue-300' 
          : 'text-gray-400 hover:text-gray-300'
      }`}
    >
      <FontAwesomeIcon 
        icon={faFilter} 
        className={`w-3 h-3 ${
          filtersAreActive 
            ? 'text-blue-400' 
            : 'text-gray-500'
        }`} 
      />
      <span className={`text-xs ${
        filtersAreActive 
          ? 'text-blue-400' 
          : 'text-gray-400'
      }`}>
        {hasActiveFilters ? `${filteredCount}/${resultCount}` : `${resultCount}`}
      </span>
      <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3" />
    </button>
  );
}
