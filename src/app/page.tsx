'use client';

import { useState, useEffect } from 'react';
import { ndk, connect } from '@/lib/ndk';

export default function Home() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    connect();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    try {
      // TODO: Implement actual search using NDK
      console.log('Searching for:', query);
      // We'll implement the actual search in the next step
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
          placeholder="from:friends GM"
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
