import { ConnectionStatus } from '@/lib/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

interface RelayIndicatorProps {
  connectionStatus: 'connecting' | 'connected' | 'timeout';
  connectionDetails: ConnectionStatus | null;
  showConnectionDetails: boolean;
  onToggle: () => void;
  formatConnectionTooltip: (details: ConnectionStatus | null) => string;
}

export default function RelayIndicator({
  connectionStatus,
  connectionDetails,
  showConnectionDetails,
  onToggle,
  formatConnectionTooltip
}: RelayIndicatorProps) {
  // Calculate connected and total relay counts
  const connectedCount = connectionDetails?.connectedRelays?.length || 0;
  const totalCount = connectedCount + (connectionDetails?.failedRelays?.length || 0) + (connectionDetails?.connectingRelays?.length || 0);

  return (
    <div>
      {/* Collapsed view */}
      {!showConnectionDetails && (
        <button
          type="button"
          className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
          onClick={onToggle}
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
          <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3" />
        </button>
      )}

      {/* Expanded view */}
      {showConnectionDetails && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
            onClick={onToggle}
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
      )}
    </div>
  );
}
