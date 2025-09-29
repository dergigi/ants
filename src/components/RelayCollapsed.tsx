'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { ConnectionStatus } from '@/lib/ndk';

interface RelayCollapsedProps {
  connectionStatus: 'connecting' | 'connected' | 'timeout';
  connectedCount: number;
  totalCount: number;
  onExpand: () => void;
  formatConnectionTooltip: (details: ConnectionStatus | null) => string;
  connectionDetails: ConnectionStatus | null;
  isExpanded?: boolean;
}

export default function RelayCollapsed({
  connectionStatus,
  connectedCount,
  totalCount,
  onExpand,
  formatConnectionTooltip,
  connectionDetails,
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
          connectionStatus === 'connected' ? 'text-blue-400' : 'text-gray-500'
        }`} 
      />
      <span className="text-xs">
        {connectedCount}/{totalCount}
      </span>
      <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} className="w-3 h-3" />
    </button>
  );
}
