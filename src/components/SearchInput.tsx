'use client';

import { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faExternalLink, faUser } from '@fortawesome/free-solid-svg-icons';

interface SearchInputProps {
  query: string;
  placeholder: string;
  loading: boolean;
  resolvingAuthor: boolean;
  showExternalButton: boolean;
  avatarOverlap: boolean;
  profileScopeUser: { profile?: { displayName?: string; name?: string } } | null;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onOpenExternal: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onExampleNext: () => void;
  rotationProgress: number;
}

export default function SearchInput({
  query,
  placeholder,
  loading,
  resolvingAuthor,
  showExternalButton,
  avatarOverlap,
  profileScopeUser,
  onInputChange,
  onClear,
  onOpenExternal,
  onSubmit,
  onExampleNext,
  rotationProgress
}: SearchInputProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const getButtonIcon = () => {
    if (loading) {
      return resolvingAuthor ? (
        <FontAwesomeIcon icon={faUser} className="animate-spin" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
      );
    }
    return showExternalButton ? (
      <FontAwesomeIcon icon={faExternalLink} />
    ) : (
      <FontAwesomeIcon icon={faMagnifyingGlass} />
    );
  };

  const getButtonTitle = () => {
    if (showExternalButton) return "Open URL in new tab";
    if (profileScopeUser) return `Searching in ${profileScopeUser.profile?.displayName || profileScopeUser.profile?.name || 'user'}'s posts`;
    return "Search";
  };

  return (
    <form onSubmit={onSubmit} className={`w-full ${avatarOverlap ? 'pr-16' : ''}`} id="search-row">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={onInputChange}
            placeholder={placeholder}
            className="w-full px-4 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] text-gray-100 placeholder-gray-400"
            style={{ paddingRight: '3rem' }}
          />
          {query && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
          {!query && !loading && (
            <button
              type="button"
              aria-label="Next example"
              title="Show next example"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 cursor-pointer"
              onClick={onExampleNext}
            >
              <svg viewBox="0 0 36 36" className="w-5 h-5">
                <circle cx="18" cy="18" r="16" stroke="#3d3d3d" strokeWidth="3" fill="none" />
                <circle cx="18" cy="18" r="16" stroke="#9ca3af" strokeWidth="3" fill="none"
                  strokeDasharray={`${Math.max(1, Math.floor(rotationProgress * 100))}, 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
              </svg>
            </button>
          )}
        </div>
        <button 
          type={showExternalButton ? "button" : "submit"} 
          onClick={showExternalButton ? onOpenExternal : undefined}
          className="px-6 py-2 bg-[#3d3d3d] text-gray-100 rounded-lg hover:bg-[#4d4d4d] focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] transition-colors"
          title={getButtonTitle()}
        >
          {getButtonIcon()}
        </button>
      </div>
    </form>
  );
}
