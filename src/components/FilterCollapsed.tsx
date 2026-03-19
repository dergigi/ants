'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

interface FilterCollapsedProps {
  filtersAreActive: boolean;
  hasActiveFilters: boolean;
  filteredCount: number;
  resultCount: number;
  relayCount?: { total: number } | null;
  onExpand: () => void;
  isExpanded?: boolean;
}

export default function FilterCollapsed({
  filtersAreActive,
  hasActiveFilters,
  filteredCount,
  resultCount,
  relayCount,
  onExpand,
  isExpanded = false
}: FilterCollapsedProps) {
  // Build count display:
  //   "200"                 — no relay count (today's behavior)
  //   "200 / ~203,873"     — with relay count
  //   "50/200 / ~203,873"  — with active filters + relay count
  let countText: string;
  if (hasActiveFilters) {
    countText = `${filteredCount}/${resultCount}`;
  } else {
    countText = `${resultCount}`;
  }

  if (relayCount && relayCount.total > resultCount) {
    countText += ` / ~${relayCount.total.toLocaleString()}`;
  }

  return (
    <button
      onClick={onExpand}
      className={`flex items-center gap-2 text-sm transition-colors ${
        filtersAreActive
          ? 'text-blue-400 hover:text-blue-300'
          : 'text-gray-400 hover:text-gray-300'
      }`}
    >
      <FontAwesomeIcon
        icon={faFilter}
        className={`w-3 h-3 ${
          filtersAreActive
            ? 'text-blue-400'
            : 'text-gray-500'
        }`}
      />
      <span className={`text-xs ${
        filtersAreActive
          ? 'text-blue-400'
          : 'text-gray-400'
      }`}>
        {countText}
      </span>
      <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} className="w-3 h-3" />
    </button>
  );
}
