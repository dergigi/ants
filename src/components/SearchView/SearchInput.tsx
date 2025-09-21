import { useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

interface SearchInputProps {
  query: string;
  placeholder: string;
  loading: boolean;
  resolvingAuthor: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export default function SearchInput({
  query,
  placeholder,
  loading,
  resolvingAuthor,
  onInputChange,
  onSubmit,
  onKeyDown
}: SearchInputProps) {
  const searchRowRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    // Focus the search input when component mounts
    const input = searchRowRef.current?.querySelector('input');
    if (input) {
      input.focus();
    }
  }, []);

  return (
    <form
      ref={searchRowRef}
      onSubmit={onSubmit}
      className="flex items-center gap-2 mb-6"
    >
      <div className="flex-1 relative">
        <input
          type="text"
          value={query}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
        />
        {resolvingAuthor && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
