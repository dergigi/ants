import { ConnectionStatus } from '@/lib/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWifi, faServer } from '@fortawesome/free-solid-svg-icons';
import { getRelayLists } from '@/lib/relayCounts';

interface RelayStatusDisplayProps {
  connectionDetails: ConnectionStatus;
  recentlyActive: string[];
}

export default function RelayStatusDisplay({ 
  connectionDetails, 
  recentlyActive 
}: RelayStatusDisplayProps) {
  // Use shared calculation logic to ensure consistency with other components
  const { 
    eventsReceivedRelays, 
    otherRelays, 
    eventsReceivedCount, 
    totalCount 
  } = getRelayLists(connectionDetails, recentlyActive);
  
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
          <div className="text-blue-400 font-medium mb-1 flex items-center">
            <FontAwesomeIcon icon={faWifi} className="mr-1" />
            Events received ({displayEventsReceivedCount})
          </div>
          <div className="space-y-1">
            {eventsReceivedRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get(relay);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              return (
                <div key={idx} className="text-[11px] text-gray-400 font-mono ml-2">
                  {relay.replace(/\/$/, '')}{pingDisplay}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Other relays */}
      {otherRelays.length > 0 && (
        <div className="mb-2">
          <div className="text-gray-400 font-medium mb-1 flex items-center">
            <FontAwesomeIcon icon={faServer} className="mr-1" />
            Other Relays ({displayOthersCount})
          </div>
          <div className="space-y-1">
            {otherRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get(relay);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              return (
                <div key={idx} className="text-[11px] text-gray-400 font-mono ml-2">
                  {relay.replace(/\/$/, '')}{pingDisplay}
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
