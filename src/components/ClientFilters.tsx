'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

export interface FilterSettings {
  maxEmojis: number | null;
  maxHashtags: number | null;
}

interface Props {
  filterSettings: FilterSettings;
  onFilterChange: (settings: FilterSettings) => void;
  resultCount: number;
  filteredCount: number;
}

export default function ClientFilters({ filterSettings, onFilterChange, resultCount, filteredCount }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleEmojiChange = (value: string) => {
    const maxEmojis = value === '' ? null : Math.max(0, parseInt(value, 10));
    onFilterChange({ ...filterSettings, maxEmojis });
  };

  const handleHashtagChange = (value: string) => {
    const maxHashtags = value === '' ? null : Math.max(0, parseInt(value, 10));
    onFilterChange({ ...filterSettings, maxHashtags });
  };

  const clearFilters = () => {
    onFilterChange({ maxEmojis: null, maxHashtags: null });
  };

  const hasActiveFilters = filterSettings.maxEmojis !== null || filterSettings.maxHashtags !== null;

  return (
    <div className="mb-4 flex justify-end">
      {/* Collapsed view */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
        >
          <FontAwesomeIcon icon={faFilter} className="w-3 h-3" />
          <span className="text-xs text-gray-400">
            {hasActiveFilters ? `${filteredCount}/${resultCount}` : `${resultCount}`}
          </span>
          <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3" />
        </button>
      )}

      {/* Expanded view */}
      {isExpanded && (
        <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faFilter} className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-200">Filter Results</span>
              {hasActiveFilters && (
                <span className="text-xs text-gray-400">
                  {filteredCount}/{resultCount} shown
                </span>
              )}
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-300 transition-colors"
            >
              <FontAwesomeIcon icon={faChevronUp} className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Emoji filter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-300">
                  Max emojis per note
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">
                    {filterSettings.maxEmojis === null ? 'No limit' : filterSettings.maxEmojis}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={filterSettings.maxEmojis === null ? 10 : filterSettings.maxEmojis}
                onChange={(e) => handleEmojiChange(e.target.value)}
                className="w-full h-1.5 rounded bg-[#1f1f1f] outline-none disabled:opacity-50 accent-[#4a4a4a]"
              />
            </div>

            {/* Hashtag filter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-300">
                  Max hashtags per note
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">
                    {filterSettings.maxHashtags === null ? 'No limit' : filterSettings.maxHashtags}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={filterSettings.maxHashtags === null ? 5 : filterSettings.maxHashtags}
                onChange={(e) => handleHashtagChange(e.target.value)}
                className="w-full h-1.5 rounded bg-[#1f1f1f] outline-none disabled:opacity-50 accent-[#4a4a4a]"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end">
              <button
                onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-gray-300 underline transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
