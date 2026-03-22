'use client';

import { useMemo, useState } from 'react';
import { ConnectionStatus } from '@/lib/ndk';
import { getRelayLists } from '@/lib/relayCounts';
import { relayInfoCache } from '@/lib/relays';
import { normalizeRelayUrl } from '@/lib/urlUtils';
import { getStoredPubkey } from '@/lib/nip07';
import { getSearchLocalRelays, setSearchLocalRelays } from '@/lib/storage';
import RelayRow from './RelayRow';

type RelayInfo = ReturnType<typeof getRelayLists>;

interface RelayStatusDisplayProps {
  connectionDetails: ConnectionStatus;
  relayInfo: RelayInfo;
  activeRelays: Set<string>;
  toggledRelays: Set<string>;
  onToggleRelay?: (relayUrl: string) => void;
  onSearch?: (query: string) => void;
}

function getRelayInfoFromCache(relayUrl: string) {
  let cached = relayInfoCache.get(relayUrl);
  if (!cached) {
    const withSlash = relayUrl.endsWith('/') ? relayUrl : relayUrl + '/';
    const withoutSlash = relayUrl.endsWith('/') ? relayUrl.slice(0, -1) : relayUrl;
    cached = relayInfoCache.get(withSlash) || relayInfoCache.get(withoutSlash);
  }
  return {
    supportedNips: cached?.supportedNips || [],
    name: cached?.name || relayUrl.replace('wss://', '').replace('ws://', ''),
  };
}

export default function RelayStatusDisplay({
  connectionDetails, relayInfo: relayData,
  activeRelays, toggledRelays, onToggleRelay, onSearch,
}: RelayStatusDisplayProps) {
  const eventsReceivedRelays = useMemo(() => relayData.eventsReceivedRelays || [], [relayData.eventsReceivedRelays]);
  const otherRelays = useMemo(() => relayData.otherRelays || [], [relayData.otherRelays]);
  const allRelays = useMemo(() => [...eventsReceivedRelays, ...otherRelays], [eventsReceivedRelays, otherRelays]);

  return (
    <div key={`relay-status-${allRelays.length}`}
      className="mt-2 p-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-xs w-full">
      {allRelays.length > 0 ? (
        <div className="space-y-1">
          {allRelays.map((relay, idx) => {
            const normalizedUrl = normalizeRelayUrl(relay.url);
            const { supportedNips } = getRelayInfoFromCache(relay.url);
            return (
              <RelayRow
                key={idx}
                url={relay.url}
                normalizedUrl={normalizedUrl}
                supportedNips={supportedNips}
                ping={connectionDetails?.relayPings?.get?.(relay.url)}
                providedResults={activeRelays.has(normalizedUrl)}
                isToggled={toggledRelays.has(normalizedUrl)}
                isActive={activeRelays.has(normalizedUrl)}
                onToggleRelay={onToggleRelay}
                onSearch={onSearch}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-gray-400">No relay connection information available</div>
      )}

      {getStoredPubkey() && <LocalRelaysToggle />}
    </div>
  );
}

function LocalRelaysToggle() {
  const [enabled, setEnabled] = useState(getSearchLocalRelays);
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSearchLocalRelays(next);
  };
  return (
    <label className="flex items-center gap-2 text-xs text-gray-400 mt-3 pt-2 border-t border-[#3d3d3d] cursor-pointer">
      <input type="checkbox" checked={enabled} onChange={toggle} className="accent-[#4a4a4a]" />
      <span>Search local relays</span>
    </label>
  );
}
