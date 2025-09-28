'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faChevronUp } from '@fortawesome/free-solid-svg-icons';

interface FilterExpandedProps {
  filtersAreActive: boolean;
  hasActiveFilters: boolean;
  filteredCount: number;
  resultCount: number;
  onCollapse: () => void;
  children: React.ReactNode;
}

export default function FilterExpanded({
  filtersAreActive,
  hasActiveFilters,
  filteredCount,
  resultCount,
  onCollapse,
  children
}: FilterExpandedProps) {
  return (
    <div className="w-full">
      {/* Button row */}
      <div className="flex justify-end">
        <button
          onClick={onCollapse}
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
          <FontAwesomeIcon icon={faChevronUp} className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded content - full width */}
      <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-3 space-y-3 w-full">
        {children}
      </div>
    </div>
  );
}
