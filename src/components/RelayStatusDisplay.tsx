import { ConnectionStatus } from '@/lib/ndk';

interface RelayStatusDisplayProps {
  connectionDetails: ConnectionStatus;
  recentlyActive: string[];
}

export default function RelayStatusDisplay({ 
  connectionDetails, 
  recentlyActive 
}: RelayStatusDisplayProps) {
  // Group relays by "Events received" and "Others"
  const connectedSet = new Set(connectionDetails?.connectedRelays || []);
  
  // Events received: connected relays + recently active relays (no duplicates)
  const eventsReceivedRelays = Array.from(new Set([
    ...(connectionDetails?.connectedRelays || []),
    ...recentlyActive
  ]));
  
  // Create a set of all relays that received events to ensure mutual exclusivity
  const eventsReceivedSet = new Set(eventsReceivedRelays);
  
  // Others: connecting + failed relays (excluding those that received events)
  const otherRelays = [
    ...(connectionDetails?.connectingRelays || []),
    ...(connectionDetails?.failedRelays || [])
  ].filter(relay => !eventsReceivedSet.has(relay));

  return (
    <div className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full">
      
      {/* Events received relays */}
      {eventsReceivedRelays.length > 0 && (
        <div className="mb-2">
          <div className="text-green-400 font-medium mb-1">
            📨 Events received ({eventsReceivedRelays.length})
          </div>
          <div className="space-y-1">
            {eventsReceivedRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get(relay);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              const isConnected = connectedSet.has(relay);
              const statusIcon = isConnected ? '🟢' : '🔵';
              return (
                <div key={idx} className="text-gray-300 ml-2">
                  {statusIcon} {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}{pingDisplay}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Other relays */}
      {otherRelays.length > 0 && (
        <div className="mb-2">
          <div className="text-gray-400 font-medium mb-1">
            ⚪ Others ({otherRelays.length})
          </div>
          <div className="space-y-1">
            {otherRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get(relay);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              const isConnecting = connectionDetails?.connectingRelays?.includes(relay);
              const isFailed = connectionDetails?.failedRelays?.includes(relay);
              const statusIcon = isConnecting ? '🟡' : isFailed ? '🔴' : '⚪';
              return (
                <div key={idx} className="text-gray-300 ml-2">
                  {statusIcon} {relay.replace(/^wss:\/\//, '').replace(/\/$/, '')}{pingDisplay}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {eventsReceivedRelays.length === 0 && otherRelays.length === 0 && (
        <div className="text-gray-400">
          No relay connection information available
        </div>
      )}
    </div>
  );
}
