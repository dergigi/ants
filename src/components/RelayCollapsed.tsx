'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

interface RelayCollapsedProps {
  connectedCount: number; // Number of relays that provided results
  totalCount: number; // Total number of relays queried
  onExpand: () => void;
  isExpanded?: boolean;
}

export default function RelayCollapsed({
  connectedCount,
  totalCount,
  onExpand,
  isExpanded = false
}: RelayCollapsedProps) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
      onClick={onExpand}
    >
      <FontAwesomeIcon 
        icon={faServer} 
        className={`w-3 h-3 ${
          connectedCount > 0 ? 'text-blue-400' : 'text-gray-500'
        }`} 
      />
      <span className={`text-xs ${connectedCount > 0 ? 'text-blue-400' : ''}`}>
        {connectedCount}/{totalCount}
      </span>
      <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} className="w-3 h-3" />
    </button>
  );
}
