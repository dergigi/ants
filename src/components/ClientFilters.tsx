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
          <span>Filter results</span>
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
              {filteredCount}/{resultCount}
            </span>
          )}
          <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3" />
        </button>
      )}

      {/* Expanded view */}
      {isExpanded && (
        <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faFilter} className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-200">Client-side Filters</span>
              {hasActiveFilters && (
                <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
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
              <label className="block text-xs text-gray-300 mb-1">
                Max emojis per note
              </label>
              <input
                type="number"
                min="0"
                placeholder="No limit"
                value={filterSettings.maxEmojis ?? ''}
                onChange={(e) => handleEmojiChange(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-[#1f1f1f] border border-[#3d3d3d] rounded text-gray-100 placeholder-gray-500 focus:border-[#4a4a4a] focus:outline-none"
              />
            </div>

            {/* Hashtag filter */}
            <div>
              <label className="block text-xs text-gray-300 mb-1">
                Max hashtags per note
              </label>
              <input
                type="number"
                min="0"
                placeholder="No limit"
                value={filterSettings.maxHashtags ?? ''}
                onChange={(e) => handleHashtagChange(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-[#1f1f1f] border border-[#3d3d3d] rounded text-gray-100 placeholder-gray-500 focus:border-[#4a4a4a] focus:outline-none"
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
