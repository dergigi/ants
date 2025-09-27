'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { faIdBadge } from '@fortawesome/free-regular-svg-icons';

export type FilterMode = 'always' | 'never' | 'intelligently';

export interface FilterSettings {
  maxEmojis: number | null;
  maxHashtags: number | null;
  hideLinks: boolean;
  resultFilter: string;
  verifiedOnly: boolean;
  fuzzyEnabled: boolean;
  hideBots: boolean;
  hideNsfw: boolean;
  filterMode: FilterMode;
}

interface Props {
  filterSettings: FilterSettings;
  onFilterChange: (settings: FilterSettings) => void;
  resultCount: number;
  filteredCount: number;
}

export default function ClientFilters({ filterSettings, onFilterChange, resultCount, filteredCount }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [emojiLimit, setEmojiLimit] = useState<number>(filterSettings.maxEmojis ?? 3);
  const [hashtagLimit, setHashtagLimit] = useState<number>(filterSettings.maxHashtags ?? 3);

  const emojiEnabled = filterSettings.maxEmojis !== null;
  const hashtagEnabled = filterSettings.maxHashtags !== null;

  const handleEmojiChange = (value: string) => {
    const parsed = Math.max(0, parseInt(value || '0', 10));
    setEmojiLimit(parsed);
    if (emojiEnabled) {
      onFilterChange({ ...filterSettings, maxEmojis: parsed });
    }
  };

  const handleHashtagChange = (value: string) => {
    const parsed = Math.max(0, parseInt(value || '0', 10));
    setHashtagLimit(parsed);
    if (hashtagEnabled) {
      onFilterChange({ ...filterSettings, maxHashtags: parsed });
    }
  };

  const clearFilters = () => {
    onFilterChange({ maxEmojis: null, maxHashtags: null, hideLinks: false, resultFilter: '', verifiedOnly: false, fuzzyEnabled: false, hideBots: false, hideNsfw: false, filterMode: 'never' });
  };

  const resetToDefaults = () => {
    setEmojiLimit(3);
    setHashtagLimit(3);
    onFilterChange({ maxEmojis: 3, maxHashtags: 3, hideLinks: false, resultFilter: '', verifiedOnly: false, fuzzyEnabled: true, hideBots: false, hideNsfw: false, filterMode: 'intelligently' });
  };

  const hasActiveFilters = filterSettings.maxEmojis !== null || filterSettings.maxHashtags !== null || filterSettings.hideLinks || filterSettings.hideBots || filterSettings.hideNsfw || filterSettings.verifiedOnly || (filterSettings.fuzzyEnabled && (filterSettings.resultFilter || '').trim().length > 0);
  
  // Determine if filters are actually active (enabled and filtering results)
  const filtersAreActive = filterSettings.filterMode !== 'never' && (filterSettings.filterMode === 'always' || (filterSettings.filterMode === 'intelligently' && resultCount >= 100));

  return (
    <div className="mt-3 mb-4">
      {/* Collapsed view */}
      {!isExpanded && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsExpanded(true)}
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
              {hasActiveFilters ? `${filteredCount}/${resultCount}` : `${resultCount}`}
            </span>
            <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Expanded view */}
      {isExpanded && (
        <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200">Filter Results:</span>
              <div className="flex bg-[#1f1f1f] border border-[#3d3d3d] rounded-md p-0.5">
                {(['always', 'intelligently', 'never'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onFilterChange({ ...filterSettings, filterMode: mode })}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      filterSettings.filterMode === mode
                        ? 'bg-[#4a4a4a] text-gray-100'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]'
                    }`}
                  >
                    {mode === 'always' ? 'Always' : 
                     mode === 'never' ? 'Never' : 'Smart'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{filteredCount}/{resultCount} shown</span>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                <FontAwesomeIcon icon={faChevronUp} className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className={`space-y-2 ${filterSettings.filterMode === 'never' ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Fuzzy filter with enable checkbox and icon */}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={filterSettings.fuzzyEnabled}
                onChange={(e) => onFilterChange({ ...filterSettings, fuzzyEnabled: e.target.checked, resultFilter: e.target.checked ? filterSettings.resultFilter : '' })}
                className="accent-[#4a4a4a]"
                disabled={filterSettings.filterMode === 'never'}
              />
              <div className="relative w-full max-w-xs">
                <FontAwesomeIcon icon={faFilter} className={`absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ${filterSettings.fuzzyEnabled ? 'text-gray-400' : 'text-gray-600'}`} />
                <input
                  type="text"
                  value={filterSettings.resultFilter || ''}
                  onChange={(e) => onFilterChange({ ...filterSettings, resultFilter: e.target.value })}
                  disabled={!filterSettings.fuzzyEnabled || filterSettings.filterMode === 'never'}
                  className={`w-full pl-6 pr-2 py-1 text-xs bg-[#1f1f1f] border border-[#3d3d3d] rounded text-gray-100 focus:border-[#4a4a4a] focus:outline-none ${!filterSettings.fuzzyEnabled || filterSettings.filterMode === 'never' ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
            </label>

            {/* Valid NIP-05 */}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={filterSettings.verifiedOnly}
                onChange={(e) => onFilterChange({ ...filterSettings, verifiedOnly: e.target.checked })}
                className="accent-[#4a4a4a]"
                disabled={filterSettings.filterMode === 'never'}
              />
              <span>Valid NIP-05</span>
              <FontAwesomeIcon icon={faIdBadge} className="w-3 h-3 text-green-400" />
            </label>

            {/* Hide more than X emojis */}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={emojiEnabled}
                onChange={(e) => {
                  onFilterChange({ ...filterSettings, maxEmojis: e.target.checked ? (emojiLimit || 3) : null });
                }}
                className="accent-[#4a4a4a]"
                disabled={filterSettings.filterMode === 'never'}
              />
              <span>Hide more than</span>
              <input
                type="number"
                min="0"
                max="9"
                value={emojiLimit}
                onChange={(e) => handleEmojiChange(e.target.value)}
                className="w-8 px-1 py-0.5 text-right text-xs bg-[#1f1f1f] border border-[#3d3d3d] rounded text-gray-100 placeholder-gray-500 focus:border-[#4a4a4a] focus:outline-none"
                disabled={filterSettings.filterMode === 'never'}
              />
              <span>emojis</span>
            </label>

            {/* Hide more than X hashtags */}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={hashtagEnabled}
                onChange={(e) => {
                  onFilterChange({ ...filterSettings, maxHashtags: e.target.checked ? (hashtagLimit || 3) : null });
                }}
                className="accent-[#4a4a4a]"
                disabled={filterSettings.filterMode === 'never'}
              />
              <span>Hide more than</span>
              <input
                type="number"
                min="0"
                max="9"
                value={hashtagLimit}
                onChange={(e) => handleHashtagChange(e.target.value)}
                className="w-8 px-1 py-0.5 text-right text-xs bg-[#1f1f1f] border border-[#3d3d3d] rounded text-gray-100 placeholder-gray-500 focus:border-[#4a4a4a] focus:outline-none"
                disabled={filterSettings.filterMode === 'never'}
              />
              <span>hashtags</span>
            </label>

            {/* Hide external links */}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={filterSettings.hideLinks}
                onChange={(e) => {
                  onFilterChange({ ...filterSettings, hideLinks: e.target.checked });
                }}
                className="accent-[#4a4a4a]"
                disabled={filterSettings.filterMode === 'never'}
              />
              <span>Hide external links</span>
            </label>

            {/* Hide bots */}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={filterSettings.hideBots}
                onChange={(e) => onFilterChange({ ...filterSettings, hideBots: e.target.checked })}
                className="accent-[#4a4a4a]"
                disabled={filterSettings.filterMode === 'never'}
              />
              <span>Hide bots</span>
            </label>

          {/* Hide NSFW */}
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={filterSettings.hideNsfw}
              onChange={(e) => onFilterChange({ ...filterSettings, hideNsfw: e.target.checked })}
              className="accent-[#4a4a4a]"
              disabled={!filterSettings.filtersEnabled}
            />
            <span>Hide NSFW</span>
          </label>
          </div>

          <div className="flex justify-end gap-4">
            <button
              onClick={resetToDefaults}
              className="text-xs text-gray-400 hover:text-gray-300 underline transition-colors"
            >
              Reset to defaults
            </button>
            <button
              onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-gray-300 underline transition-colors"
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
