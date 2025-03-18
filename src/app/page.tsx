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
        limit: 21
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
    <main className="min-h-screen bg-black text-white p-4">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Search Section */}
        <div className="space-y-4">
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

        {/* Results Section */}
        <div className="space-y-4">
          {results.map((event) => (
            <div key={event.id} className="bg-gray-900 rounded-lg p-4 space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-400">
                  {event.pubkey.slice(0, 8)}...{event.pubkey.slice(-8)}
                </span>
                <span className="text-sm text-gray-500">
                  {new Date(event.created_at * 1000).toLocaleString()}
                </span>
              </div>
              <p className="text-white">{event.content}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
