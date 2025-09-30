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
  
  // Get relay info directly from cache - no complex loading
  const getRelayInfoFromCache = (relayUrl: string) => {
    // Check if relay is in our known search relays
    const knownSearchRelays = new Set([
      ...RELAYS.SEARCH,
      ...RELAYS.PROFILE_SEARCH
    ]);
    
    if (knownSearchRelays.has(relayUrl as any)) {
      // For known search relays, assume they support NIP-50 and common NIPs
      return {
        supportedNips: [1, 2, 4, 9, 11, 16, 20, 22, 28, 40, 42, 50, 70, 77, 98],
        name: relayUrl.replace('wss://', '').replace('ws://', ''),
        description: 'Known search relay',
        contact: '',
        software: '',
        version: ''
      };
    }
    
    // For other relays, return empty info for now
    return {
      supportedNips: [],
      name: relayUrl.replace('wss://', '').replace('ws://', ''),
      description: '',
      contact: '',
      software: '',
      version: ''
    };
  };

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
            
            const iconClasses = providedResults
              ? `border border-blue-400/20 text-blue-300 bg-blue-900/60`
              : isActive
                ? 'text-gray-300 bg-gray-700/40 border border-gray-400/30'
                : 'text-gray-500 bg-transparent';
            
            // Get relay info from cache
            const relayData = getRelayInfoFromCache(relay.url);
            const { supportedNips = [] } = relayData;
            
            // Check if relay supports NIP-50
            const supportsNip50 = supportedNips.includes(50);
            
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
