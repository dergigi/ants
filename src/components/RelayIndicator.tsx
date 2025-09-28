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
  return (
    <button
      type="button"
      className="flex items-center gap-1 touch-manipulation"
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
      <FontAwesomeIcon 
        icon={showConnectionDetails ? faChevronUp : faChevronDown} 
        className="w-2 h-2 text-gray-400" 
      />
    </button>
  );
}
