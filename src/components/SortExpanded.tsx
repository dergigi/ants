'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpWideShort, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { SortOrder } from './SortCollapsed';

interface SortExpandedProps {
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  onCollapse: () => void;
}

export default function SortExpanded({
  sortOrder,
  onSortChange,
  onCollapse
}: SortExpandedProps) {
  return (
    <div className="w-full">
      {/* Button row */}
      <div className="flex justify-end">
        <button
          type="button"
          className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
          onClick={onCollapse}
        >
          <FontAwesomeIcon 
            icon={faArrowUpWideShort} 
            className="w-3 h-3 text-gray-500" 
          />
          <span className="text-xs text-gray-400">
            {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
          </span>
          <FontAwesomeIcon icon={faChevronUp} className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded content - full width */}
      <div className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full">
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer hover:text-gray-200">
            <input
              type="radio"
              name="sortOrder"
              value="newest"
              checked={sortOrder === 'newest'}
              onChange={() => {
                onSortChange('newest');
                onCollapse();
              }}
              className="accent-blue-500"
            />
            <span>Newest first</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer hover:text-gray-200">
            <input
              type="radio"
              name="sortOrder"
              value="oldest"
              checked={sortOrder === 'oldest'}
              onChange={() => {
                onSortChange('oldest');
                onCollapse();
              }}
              className="accent-blue-500"
            />
            <span>Oldest first</span>
          </label>
        </div>
      </div>
    </div>
  );
}

