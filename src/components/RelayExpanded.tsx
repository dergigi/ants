'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { ConnectionStatus } from '@/lib/ndk';

interface RelayExpandedProps {
  connectionStatus: 'connecting' | 'connected' | 'timeout';
  connectedCount: number;
  totalCount: number;
  onCollapse: () => void;
  formatConnectionTooltip: (details: ConnectionStatus | null) => string;
  connectionDetails: ConnectionStatus | null;
  children: React.ReactNode;
}

export default function RelayExpanded({
  connectionStatus,
  connectedCount,
  totalCount,
  onCollapse,
  formatConnectionTooltip,
  connectionDetails,
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
          title={formatConnectionTooltip(connectionDetails)}
        >
          <FontAwesomeIcon 
            icon={faServer} 
            className={`w-3 h-3 ${
              connectionStatus === 'connected' ? 'text-blue-400' : 
              connectionStatus === 'timeout' ? 'text-yellow-400' : 'text-gray-500'
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
