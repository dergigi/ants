import { ConnectionStatus } from '@/lib/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHardDrive } from '@fortawesome/free-solid-svg-icons';
import { getRelayLists } from '@/lib/relayCounts';

type RelayInfo = ReturnType<typeof getRelayLists> & { relayPings?: Map<string, number> };

interface RelayStatusDisplayProps {
  connectionDetails: ConnectionStatus;
  relayInfo: RelayInfo;
  onSearch?: (query: string) => void;
}

export default function RelayStatusDisplay({ 
  connectionDetails,
  relayInfo,
  onSearch
}: RelayStatusDisplayProps) {
  const { 
    eventsReceivedRelays, 
    otherRelays, 
    eventsReceivedCount, 
    totalCount 
  } = relayInfo;

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
          <div className="text-blue-400 font-medium mb-1">
            Events received ({displayEventsReceivedCount})
          </div>
          <div className="space-y-1">
            {eventsReceivedRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get?.(relay.url);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              const iconClasses = relay.isSearchRelay
                ? 'text-blue-300 bg-blue-900/40 border border-blue-400/20'
                : 'text-blue-400 bg-transparent';
              return (
                <div key={idx} className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[12px] leading-none ${iconClasses}`}>
                    <FontAwesomeIcon icon={faHardDrive} className="text-xs" />
                  </div>
                  {onSearch ? (
                    <button
                      type="button"
                      onClick={() => onSearch(relay.url.replace(/\/$/, ''))}
                      className="hover:text-gray-200 hover:underline cursor-pointer"
                    >
                      {relay.url.replace(/\/$/, '')}{pingDisplay}
                    </button>
                  ) : (
                    <span>{relay.url.replace(/\/$/, '')}{pingDisplay}</span>
                  )}
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
            Other Relays ({displayOthersCount})
          </div>
          <div className="space-y-1">
            {otherRelays.map((relay, idx) => {
              const ping = connectionDetails?.relayPings?.get?.(relay.url);
              const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
              const iconClasses = relay.isSearchRelay
                ? 'text-gray-200 bg-blue-900/30 border border-blue-400/10'
                : 'text-gray-300 bg-transparent';
              return (
                <div key={idx} className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[12px] leading-none ${iconClasses}`}>
                    <FontAwesomeIcon icon={faHardDrive} className="text-xs" />
                  </div>
                  {onSearch ? (
                    <button
                      type="button"
                      onClick={() => onSearch(relay.url.replace(/\/$/, ''))}
                      className="hover:text-gray-200 hover:underline cursor-pointer"
                    >
                      {relay.url.replace(/\/$/, '')}{pingDisplay}
                    </button>
                  ) : (
                    <span>{relay.url.replace(/\/$/, '')}{pingDisplay}</span>
                  )}
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
