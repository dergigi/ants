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
    <button
      type="button"
      className="flex items-center gap-2 text-sm transition-colors touch-manipulation"
      onClick={onToggle}
      title={formatConnectionTooltip(connectionDetails)}
    >
      <FontAwesomeIcon 
        icon={faServer} 
        className={`w-3 h-3 ${
          connectionStatus === 'connected' ? 'text-blue-400' : 
          connectionStatus === 'timeout' ? 'text-yellow-400' : 'text-gray-400'
        }`} 
      />
      <span className="text-xs text-gray-400">
        {connectedCount}/{totalCount}
      </span>
      <FontAwesomeIcon 
        icon={showConnectionDetails ? faChevronUp : faChevronDown} 
        className="w-3 h-3 text-gray-400" 
      />
    </button>
  );
}
