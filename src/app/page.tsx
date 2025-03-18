'use client';

import { useState, useEffect } from 'react';
import { ndk, connect } from '@/lib/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';

export default function Home() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<NDKEvent[]>([]);

  useEffect(() => {
    connect();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      setQuery('vibe');
    }
    
    setIsLoading(true);
    try {
      const searchQuery = query.trim() || 'vibe';
      const events = await ndk.fetchEvents({
        kinds: [1], // text notes
        search: searchQuery,
        limit: 20
      });
      
      setResults(Array.from(events));
      console.log('Search results:', events);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-black text-white">
      <div className="w-full max-w-md space-y-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="vibe"
          className="w-full px-4 py-2 text-black bg-white rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
          disabled={isLoading}
        />
        <button
          onClick={handleSearch}
          className="w-full px-4 py-2 bg-white text-black rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>
    </main>
  );
}
