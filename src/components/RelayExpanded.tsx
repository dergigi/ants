'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faChevronUp } from '@fortawesome/free-solid-svg-icons';

interface RelayExpandedProps {
  connectedCount: number; // Number of relays that provided results
  totalCount: number; // Total number of relays queried
  onCollapse: () => void;
  children: React.ReactNode;
}

export default function RelayExpanded({
  connectedCount,
  totalCount,
  onCollapse,
  children
}: RelayExpandedProps) {
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
            icon={faServer} 
            className={`w-3 h-3 ${
              connectedCount > 0 ? 'text-blue-400' : 'text-gray-500'
            }`} 
          />
          <span className="text-xs">
            {connectedCount}/{totalCount}
          </span>
          <FontAwesomeIcon icon={faChevronUp} className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded content - full width */}
      <div className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full">
        {children}
      </div>
    </div>
  );
}
