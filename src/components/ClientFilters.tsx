'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

export interface FilterSettings {
  maxEmojis: number | null;
  maxHashtags: number | null;
  hideLinks: boolean;
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
    onFilterChange({ maxEmojis: null, maxHashtags: null });
  };

  const hasActiveFilters = filterSettings.maxEmojis !== null || filterSettings.maxHashtags !== null;

  return (
    <div className="mb-4">
      {/* Collapsed view */}
      {!isExpanded && (
        <div className="flex justify-end">
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
        </div>
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

          <div className="space-y-1">
            <div className="text-xs text-gray-400">Hide:</div>

            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={emojiEnabled}
                onChange={(e) => {
                  onFilterChange({ ...filterSettings, maxEmojis: e.target.checked ? (emojiLimit || 3) : null });
                }}
                className="accent-[#4a4a4a]"
              />
              <span>More than</span>
              <input
                type="number"
                min="0"
                max="9"
                value={emojiLimit}
                onChange={(e) => handleEmojiChange(e.target.value)}
                className="w-8 px-1 py-0.5 text-right text-xs bg-[#1f1f1f] border border-[#3d3d3d] rounded text-gray-100 placeholder-gray-500 focus:border-[#4a4a4a] focus:outline-none"
              />
              <span>emojis</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={hashtagEnabled}
                onChange={(e) => {
                  onFilterChange({ ...filterSettings, maxHashtags: e.target.checked ? (hashtagLimit || 3) : null });
                }}
                className="accent-[#4a4a4a]"
              />
              <span>More than</span>
              <input
                type="number"
                min="0"
                max="9"
                value={hashtagLimit}
                onChange={(e) => handleHashtagChange(e.target.value)}
                className="w-8 px-1 py-0.5 text-right text-xs bg-[#1f1f1f] border border-[#3d3d3d] rounded text-gray-100 placeholder-gray-500 focus:border-[#4a4a4a] focus:outline-none"
              />
              <span>hashtags</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={filterSettings.hideLinks}
                onChange={(e) => {
                  onFilterChange({ ...filterSettings, hideLinks: e.target.checked });
                }}
                className="accent-[#4a4a4a]"
              />
              <span>External links</span>
            </label>
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
