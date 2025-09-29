import { ConnectionStatus } from '@/lib/ndk';

interface RelayStatusDisplayProps {
  connectionDetails: ConnectionStatus;
  recentlyActive: string[];
}

export default function RelayStatusDisplay({ 
  connectionDetails, 
  recentlyActive 
}: RelayStatusDisplayProps) {
  return (
    <div className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full">
      
      {/* Connected relays */}
      {connectionDetails?.connectedRelays && connectionDetails.connectedRelays.length > 0 && (
        <div className="mb-2">
          <div className="text-green-400 font-medium mb-1">
            ✅ Connected ({connectionDetails.connectedRelays.length})
          </div>
          <div className="space-y-1">
            {connectionDetails.connectedRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get(relay);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              return (
                <div key={idx} className="text-gray-300 ml-2">
                  • {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}{pingDisplay}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently active relays (but not currently connected or failed) */}
      {(() => {
        const connectedSet = new Set(connectionDetails?.connectedRelays || []);
        const failedSet = new Set(connectionDetails?.failedRelays || []);
        const connectingSet = new Set(connectionDetails?.connectingRelays || []);
        
        // Only show recently active relays that are not in any current status
        // This prevents overlap with connected, failed, or connecting relays
        const recentlyActiveOnly = recentlyActive.filter(relay => 
          !connectedSet.has(relay) && 
          !failedSet.has(relay) && 
          !connectingSet.has(relay)
        );
        
        if (recentlyActiveOnly.length === 0) return null;
        return (
          <div className="mb-2">
            <div className="text-blue-400 font-medium mb-1">
              🔵 Recently active ({recentlyActiveOnly.length})
            </div>
            <div className="space-y-1">
              {recentlyActiveOnly.map((relay, idx) => {
                const ping = connectionDetails?.relayPings?.get(relay);
                const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
                return (
                  <div key={idx} className="text-gray-300 ml-2">
                    • {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}{pingDisplay}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      
      {/* Connecting relays */}
      {connectionDetails?.connectingRelays && connectionDetails.connectingRelays.length > 0 && (
        <div className="mb-2">
          <div className="text-yellow-400 font-medium mb-1">
            🟡 Connecting ({connectionDetails.connectingRelays.length})
          </div>
          <div className="space-y-1">
            {connectionDetails.connectingRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get(relay);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              return (
                <div key={idx} className="text-gray-300 ml-2">
                  • {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}{pingDisplay}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {(() => {
        const connectedSet = new Set(connectionDetails?.connectedRelays || []);
        const recentlyActiveSet = new Set(recentlyActive);
        const connectingSet = new Set(connectionDetails?.connectingRelays || []);
        
        // Only show relays that are truly failed (not connected, not recently active, not connecting)
        const failedFiltered = (connectionDetails?.failedRelays || []).filter((relay) => 
          !connectedSet.has(relay) && 
          !recentlyActiveSet.has(relay) && 
          !connectingSet.has(relay)
        );
        
        if (failedFiltered.length === 0) return null;
        return (
          <div>
            <div className="text-red-400 font-medium mb-1">
              ❌ Failed ({failedFiltered.length})
            </div>
            <div className="space-y-1">
              {failedFiltered.map((relay, idx) => {
                const ping = connectionDetails?.relayPings?.get(relay);
                const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
                return (
                  <div key={idx} className="text-gray-300 ml-2">
                    • {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}{pingDisplay}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      
      {(() => {
        const anyReachable = (connectionDetails?.connectedRelays?.length || 0) > 0 || recentlyActive.length > 0;
        const anyFailed = (connectionDetails?.failedRelays?.length || 0) > 0;
        return (!anyReachable && !anyFailed) ? (
        <div className="text-gray-400">
          No relay connection information available
        </div>
        ) : null;
      })()}
    </div>
  );
}
