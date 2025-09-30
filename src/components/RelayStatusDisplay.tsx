import { useState, useEffect, useMemo } from 'react';
import { ConnectionStatus, ndk } from '@/lib/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHardDrive, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { getRelayLists } from '@/lib/relayCounts';
import { getRelayInfo, RELAYS } from '@/lib/relays';

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
  
  // Track complete relay info for each relay
  const [relayInfo, setRelayInfo] = useState<Map<string, {
    supportedNips?: number[];
    name?: string;
    description?: string;
    contact?: string;
    software?: string;
    version?: string;
  }>>(new Map());

  // Track if we've already loaded relay info to prevent repeated requests
  const [hasLoadedRelayInfo, setHasLoadedRelayInfo] = useState(false);

  // Get complete relay info for connected relays (only once)
  useEffect(() => {
    if (hasLoadedRelayInfo || allRelays.length === 0) {
      return;
    }

    const getRelayInfoData = async () => {
      const infoMap = new Map<string, {
        supportedNips?: number[];
        name?: string;
        description?: string;
        contact?: string;
        software?: string;
        version?: string;
      }>();

      // Filter to only relays that are actually connected to NDK
      const connectedRelays = allRelays.filter(relay => {
        const ndkRelay = ndk.pool?.relays?.get(relay.url);
        return ndkRelay && ndkRelay.status === 1; // status 1 = connected
      });

      console.log(`[RELAY] Checking ${connectedRelays.length}/${allRelays.length} connected relays for complete info (one-time)`);

      const promises = connectedRelays.map(async (relay) => {
        try {
          const result = await getRelayInfo(relay.url);
          infoMap.set(relay.url, result);
        } catch (error) {
          console.warn(`Failed to get relay info for ${relay.url}:`, error);
          infoMap.set(relay.url, {});
        }
      });

      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
      setRelayInfo(infoMap);
      setHasLoadedRelayInfo(true);
    };

    getRelayInfoData();
  }, [allRelays, hasLoadedRelayInfo]);

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
            // Blue icon only if this relay provided results for current search
            const providedResults = activeRelays.has(cleanedUrl);
            
            // Debug logging
            if (activeRelays.size > 0) {
              console.log(`[RELAY DEBUG] Checking ${cleanedUrl}: providedResults=${providedResults}, activeRelays=`, Array.from(activeRelays));
            }
            const iconClasses = providedResults
              ? `border border-blue-400/20 text-blue-300 bg-blue-900/60`
              : isActive
                ? 'text-gray-300 bg-gray-700/40 border border-gray-400/30'
                : 'text-gray-500 bg-transparent';
            const relayData = relayInfo.get(relay.url) || {};
            const { supportedNips = [] } = relayData;
            
            // Check if relay supports NIP-50 from loaded info, or if it's in our known search relays
            const knownSearchRelays = new Set([
              ...RELAYS.SEARCH,
              ...RELAYS.PROFILE_SEARCH
            ]);
            const isKnownSearchRelay = knownSearchRelays.has(relay.url);
            const supportsNip50 = supportedNips.includes(50) || isKnownSearchRelay;
            
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
                  <div className="flex items-center gap-2">
                    {onSearch ? (
                      <button
                        type="button"
                        onClick={() => onSearch(cleanedUrl)}
                        className="hover:text-gray-200 hover:underline cursor-pointer text-left"
                      >
                        {relayData.name || cleanedUrl}{pingDisplay}
                      </button>
                    ) : (
                      <span>{relayData.name || cleanedUrl}{pingDisplay}</span>
                    )}
                    
                    {supportedNips.length > 0 && (
                      <span className="text-[10px] text-gray-500">
                        [{supportedNips.map((nip, nipIdx) => (
                          <span key={nipIdx}>
                            {onSearch ? (
                              <button
                                type="button"
                                onClick={() => onSearch(`nip:${nip}`)}
                                className="hover:text-blue-300 hover:underline cursor-pointer"
                                title={`Search for NIP-${nip}`}
                              >
                                {nip}
                              </button>
                            ) : (
                              <span>{nip}</span>
                            )}
                            {nipIdx < supportedNips.length - 1 && ', '}
                          </span>
                        ))}]
                      </span>
                    )}
                  </div>

                  {relayData.description && (
                    <span className="text-[9px] text-gray-600 mt-0.5 max-w-xs truncate" title={relayData.description}>
                      {relayData.description}
                    </span>
                  )}

                  {relayData.contact && (
                    <span className="text-[9px] text-gray-600 mt-0.5">
                      Contact: {relayData.contact}
                    </span>
                  )}

                  {relayData.software && (
                    <span className="text-[9px] text-gray-600 mt-0.5">
                      {relayData.software} {relayData.version && `v${relayData.version}`}
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
