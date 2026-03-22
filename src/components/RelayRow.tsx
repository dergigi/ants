import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faServer } from '@fortawesome/free-solid-svg-icons';
import { getRelayMonitorEntry } from '@/lib/nip66';

interface RelayRowProps {
  url: string;
  normalizedUrl: string;
  supportedNips: number[];
  ping?: number;
  providedResults: boolean;
  isToggled: boolean;
  isActive: boolean;
  onToggleRelay?: (relayUrl: string) => void;
  onSearch?: (query: string) => void;
}

export default function RelayRow({
  url, normalizedUrl, supportedNips, ping,
  providedResults, isToggled, isActive,
  onToggleRelay, onSearch,
}: RelayRowProps) {
  const pingDisplay = ping && ping > 0 ? ` (${ping}ms)` : '';
  const monitorEntry = getRelayMonitorEntry(url);
  const supportsNip50 = supportedNips.includes(50);

  const iconClasses = isToggled
    ? 'border border-blue-400/20 text-blue-300 bg-blue-900/60'
    : providedResults
      ? 'border border-gray-400/30 text-gray-300 bg-gray-700/40'
      : isActive
        ? 'text-gray-500 bg-gray-800/20 border border-gray-500/20'
        : 'text-gray-500 bg-transparent';

  const iconTitle = supportsNip50 ? 'Supports NIP-50 search' : 'Database relay (no search support)';
  const icon = supportsNip50 ? faMagnifyingGlass : faServer;

  const iconEl = (
    <div
      className={`w-5 h-5 rounded-md flex items-center justify-center text-[12px] leading-none transition-colors ${providedResults ? 'hover:opacity-80' : ''} ${iconClasses}`}
      title={providedResults
        ? (isToggled ? 'Click to hide results from this relay' : 'Click to show only results from this relay')
        : 'This relay did not provide results for the current search'}
    >
      <FontAwesomeIcon icon={icon} className="text-xs" title={iconTitle} />
    </div>
  );

  return (
    <div className="text-[11px] text-gray-400 font-mono flex items-start gap-1">
      <div className="flex items-start gap-1">
        {providedResults ? (
          <button type="button" onClick={() => onToggleRelay?.(normalizedUrl)}>
            {iconEl}
          </button>
        ) : iconEl}
      </div>
      <div className="flex flex-col">
        <div className="flex items-center">
          {onSearch ? (
            <button type="button" onClick={() => onSearch(normalizedUrl)}
              className="hover:text-gray-200 hover:underline cursor-pointer text-left">
              {normalizedUrl}{pingDisplay}
            </button>
          ) : (
            <span>{normalizedUrl}{pingDisplay}</span>
          )}
          {monitorEntry && (
            monitorEntry.isAlive ? (
              <span className="text-green-400 ml-1"
                title={`Monitor: alive${monitorEntry.rttOpen ? `, RTT ${monitorEntry.rttOpen}ms` : ''}`}>
                [{monitorEntry.rttOpen ? `${monitorEntry.rttOpen}ms` : 'alive'}]
              </span>
            ) : (
              <span className="text-red-400 ml-1" title="Monitor: dead">[dead]</span>
            )
          )}
        </div>
        {supportedNips.length > 0 && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            nips: [{supportedNips.map((nip, i) => (
              <span key={i}>
                {onSearch ? (
                  <button type="button" onClick={() => onSearch(`nip:${nip}`)}
                    className="hover:text-blue-300 hover:underline cursor-pointer"
                    title={`Search for NIP-${nip}`}>{nip}</button>
                ) : <span>{nip}</span>}
                {i < supportedNips.length - 1 && ', '}
              </span>
            ))}]
          </div>
        )}
      </div>
    </div>
  );
}
