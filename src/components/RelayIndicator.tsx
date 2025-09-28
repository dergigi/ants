import { ConnectionStatus } from '@/lib/ndk';

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
      className="w-3 h-3 touch-manipulation"
      onClick={onToggle}
      title={formatConnectionTooltip(connectionDetails)}
    >
      <div className="relative w-3 h-3">
        <div className={`w-3 h-3 rounded-full border-2 border-white/20 shadow-sm ${
          connectionStatus === 'connected' ? 'bg-blue-400' : 
          connectionStatus === 'timeout' ? 'bg-yellow-400' : 'bg-gray-400'
        }`} />
      </div>
    </button>
  );
}
