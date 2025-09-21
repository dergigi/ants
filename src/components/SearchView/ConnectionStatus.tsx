import { useState, useEffect } from 'react';
import { ConnectionStatus, addConnectionStatusListener, removeConnectionStatusListener, getRecentlyActiveRelays } from '@/lib/ndk';

interface ConnectionStatusProps {
  isConnecting: boolean;
  connectionStatus: 'connecting' | 'connected' | 'timeout';
  connectionDetails: ConnectionStatus | null;
  loadingDots: string;
  showConnectionDetails: boolean;
  setShowConnectionDetails: (show: boolean) => void;
  recentlyActive: string[];
}

export default function ConnectionStatusComponent({
  isConnecting,
  connectionStatus,
  connectionDetails,
  loadingDots,
  showConnectionDetails,
  setShowConnectionDetails,
  recentlyActive
}: ConnectionStatusProps) {
  const [rotationProgress, setRotationProgress] = useState(0);

  useEffect(() => {
    if (!isConnecting) return;
    const interval = setInterval(() => {
      setRotationProgress(prev => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, [isConnecting]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRecentlyActive(getRecentlyActiveRelays());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!isConnecting && connectionStatus === 'connected') {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
      <div className="flex items-center gap-2">
        {isConnecting ? (
          <>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Connecting{loadingDots}</span>
          </>
        ) : connectionStatus === 'timeout' ? (
          <>
            <div className="w-4 h-4 bg-yellow-500 rounded-full" />
            <span>Connection timeout</span>
          </>
        ) : (
          <>
            <div className="w-4 h-4 bg-red-500 rounded-full" />
            <span>Connection failed</span>
          </>
        )}
      </div>
      
      {connectionDetails && (
        <button
          onClick={() => setShowConnectionDetails(!showConnectionDetails)}
          className="text-blue-600 hover:text-blue-800 underline"
        >
          {showConnectionDetails ? 'Hide' : 'Show'} details
        </button>
      )}
      
      {showConnectionDetails && connectionDetails && (
        <div className="mt-2 p-3 bg-gray-100 rounded text-xs">
          <div>Connected relays: {connectionDetails.connectedRelays}</div>
          <div>Failed relays: {connectionDetails.failedRelays}</div>
          <div>Total relays: {connectionDetails.totalRelays}</div>
          {recentlyActive.length > 0 && (
            <div>Recently active: {recentlyActive.slice(0, 3).join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}
