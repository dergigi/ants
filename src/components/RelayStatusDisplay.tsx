import { ConnectionStatus } from '@/lib/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWifi, faServer } from '@fortawesome/free-solid-svg-icons';
import { calculateRelayCounts } from '@/lib/relayCounts';

interface RelayStatusDisplayProps {
  connectionDetails: ConnectionStatus;
  recentlyActive: string[];
}

export default function RelayStatusDisplay({ 
  connectionDetails, 
  recentlyActive 
}: RelayStatusDisplayProps) {
  // Use shared calculation logic to ensure consistency with other components
  const { eventsReceivedCount, totalCount } = calculateRelayCounts(connectionDetails, recentlyActive);
  
  // Group relays by "Events received" and "Others"
  
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
  
  // Use the shared calculation results for consistency
  const displayEventsReceivedCount = eventsReceivedCount;
  const displayOthersCount = totalCount - eventsReceivedCount;


  return (
    <div 
      key={`relay-status-${eventsReceivedRelays.length}-${otherRelays.length}`}
      className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full"
    >
      
      {/* Events received relays */}
      {eventsReceivedRelays.length > 0 && (
        <div className="mb-2">
          <div className="text-green-400 font-medium mb-1">
            <FontAwesomeIcon icon={faWifi} className="mr-1" />
            Events received ({displayEventsReceivedCount})
          </div>
          <div className="space-y-1">
            {eventsReceivedRelays.map((relay, idx) => {
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
      
      {/* Other relays */}
      {otherRelays.length > 0 && (
        <div className="mb-2">
          <div className="text-gray-400 font-medium mb-1">
            <FontAwesomeIcon icon={faServer} className="mr-1" />
            Other Relays ({displayOthersCount})
          </div>
          <div className="space-y-1">
            {otherRelays.map((relay, idx) => {
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
      
      {eventsReceivedRelays.length === 0 && otherRelays.length === 0 && (
        <div className="text-gray-400">
          No relay connection information available
        </div>
      )}
    </div>
  );
}
