import { useState, useEffect, useMemo } from 'react';
import { ConnectionStatus } from '@/lib/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHardDrive, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { getRelayLists } from '@/lib/relayCounts';
import { checkNip50Support } from '@/lib/relays';

type RelayInfo = ReturnType<typeof getRelayLists>;

interface RelayStatusDisplayProps {
  connectionDetails: ConnectionStatus;
  relayInfo: RelayInfo;
  activeRelays: Set<string>;
  onSearch?: (query: string) => void;
}

export default function RelayStatusDisplay({
  connectionDetails,
  relayInfo: relayData,
  activeRelays,
  onSearch
}: RelayStatusDisplayProps) {
  const eventsReceivedRelays = useMemo(() => relayData.eventsReceivedRelays || [], [relayData.eventsReceivedRelays]);
  const otherRelays = useMemo(() => relayData.otherRelays || [], [relayData.otherRelays]);

  // Combine all relays into a single list
  const allRelays = useMemo(() => [...eventsReceivedRelays, ...otherRelays], [eventsReceivedRelays, otherRelays]);
  
  // Track NIP-50 support and relay info for each relay
  const [relayInfo, setRelayInfo] = useState<Map<string, { supportsNip50: boolean; supportedNips: number[] }>>(new Map());

  // Check NIP-50 support and get relay info for all relays
  useEffect(() => {
    const checkSupport = async () => {
      const infoMap = new Map<string, { supportsNip50: boolean; supportedNips: number[] }>();
      const promises = allRelays.map(async (relay) => {
        try {
          const result = await checkNip50Support(relay.url);
          infoMap.set(relay.url, result);
        } catch (error) {
          console.warn(`Failed to check NIP-50 support for ${relay.url}:`, error);
          infoMap.set(relay.url, { supportsNip50: false, supportedNips: [] });
        }
      });
      await Promise.allSettled(promises);
      setRelayInfo(infoMap);
    };

    if (allRelays.length > 0) {
      checkSupport();
    }
  }, [allRelays]);

  return (
    <div 
      key={`relay-status-${allRelays.length}`}
      className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full"
    >
      {/* Unified relay list */}
      {allRelays.length > 0 && (
        <div className="space-y-1">
          {allRelays.map((relay, idx) => {
            const ping = connectionDetails?.relayPings?.get?.(relay.url);
            const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
            const cleanedUrl = relay.url.replace(/\/$/, '');
            const isActive = activeRelays.has(cleanedUrl);
            // Blue icon only if this relay provided results (is in eventsReceivedRelays)
            const providedResults = eventsReceivedRelays.some(r => r.url === relay.url);
            const iconClasses = providedResults
              ? `border border-blue-400/20 ${isActive ? 'text-blue-300 bg-blue-900/60' : 'text-blue-300 bg-blue-900/30'}`
              : isActive
                ? 'text-gray-300 bg-gray-700/40 border border-gray-400/30'
                : 'text-gray-500 bg-transparent';
            const relayData = relayInfo.get(relay.url) || { supportsNip50: false, supportedNips: [] };
            const { supportsNip50, supportedNips } = relayData;
            // Match magnifying glass color to relay icon color
            const magnifyingGlassColor = providedResults ? 'text-blue-300' : 'text-gray-500';
            
            return (
              <div key={idx} className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                <div className="flex items-center gap-1">
                  {supportsNip50 && (
                    <FontAwesomeIcon 
                      icon={faMagnifyingGlass} 
                      className={`text-xs ${magnifyingGlassColor}`}
                      title="Supports NIP-50 search"
                    />
                  )}
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[12px] leading-none ${iconClasses}`}>
                    <FontAwesomeIcon icon={faHardDrive} className="text-xs" />
                  </div>
                </div>
                <div className="flex flex-col">
                  {onSearch ? (
                    <button
                      type="button"
                      onClick={() => onSearch(cleanedUrl)}
                      className="hover:text-gray-200 hover:underline cursor-pointer text-left"
                    >
                      {cleanedUrl}{pingDisplay}
                    </button>
                  ) : (
                    <span>{cleanedUrl}{pingDisplay}</span>
                  )}
                  {supportedNips.length > 0 && (
                    <span className="text-[10px] text-gray-500 mt-0.5">
                      NIPs: {supportedNips.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {allRelays.length === 0 && (
        <div className="text-gray-400">
          No relay connection information available
        </div>
      )}
    </div>
  );
}
