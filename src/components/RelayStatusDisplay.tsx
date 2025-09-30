import { useState, useEffect, useMemo } from 'react';
import { ConnectionStatus, ndk } from '@/lib/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faServer } from '@fortawesome/free-solid-svg-icons';
import { getRelayLists } from '@/lib/relayCounts';
import { getRelayInfo, RELAYS, relayInfoCache } from '@/lib/relays';

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
  
  // Get relay info directly from the real cache
  const getRelayInfoFromCache = (relayUrl: string) => {
    // Debug: show what's in the cache
    console.log(`[RELAY DISPLAY] Cache contents:`, Array.from(relayInfoCache.keys()));
    console.log(`[RELAY DISPLAY] Looking for: ${relayUrl}`);
    
    // Try exact match first
    let cached = relayInfoCache.get(relayUrl);
    
    // If no exact match, try with/without trailing slash
    if (!cached) {
      const withSlash = relayUrl.endsWith('/') ? relayUrl : relayUrl + '/';
      const withoutSlash = relayUrl.endsWith('/') ? relayUrl.slice(0, -1) : relayUrl;
      
      console.log(`[RELAY DISPLAY] Trying with slash: ${withSlash}`);
      console.log(`[RELAY DISPLAY] Trying without slash: ${withoutSlash}`);
      
      cached = relayInfoCache.get(withSlash) || relayInfoCache.get(withoutSlash);
    }
    
    if (cached) {
      console.log(`[RELAY DISPLAY] Using cached info for ${relayUrl}:`, cached);
      return {
        supportedNips: cached.supportedNips || [],
        name: cached.name || relayUrl.replace('wss://', '').replace('ws://', ''),
        description: cached.description || '',
        contact: cached.contact || '',
        software: cached.software || '',
        version: cached.version || ''
      };
    }
    
    // If no cached info, return basic info
    console.log(`[RELAY DISPLAY] No cached info for ${relayUrl}`);
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
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[12px] leading-none ${iconClasses}`}>
                    {supportsNip50 ? (
                      <FontAwesomeIcon 
                        icon={faMagnifyingGlass} 
                        className="text-xs"
                        title="Supports NIP-50 search"
                      />
                    ) : (
                      <FontAwesomeIcon 
                        icon={faServer} 
                        className="text-xs"
                        title="Database relay (no search support)"
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center">
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
                  </div>
                  
                  {supportedNips.length > 0 && (
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      nips: [{supportedNips.map((nip, nipIdx) => (
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
                    </div>
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
