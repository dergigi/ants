'use client';

import { useState } from 'react';
import { ndk } from '@/lib/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const searchQuery = query.trim() || 'vibe';
      const events = await ndk.fetchEvents({
        kinds: [1],
        search: searchQuery,
        limit: 21
      });
      setResults(Array.from(events));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <div className={`max-w-2xl mx-auto px-4 ${results.length > 0 ? 'pt-4' : 'min-h-screen flex items-center'}`}>
        <form onSubmit={handleSearch} className="w-full">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="vibe"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {results.length > 0 && (
          <div className="mt-8 space-y-4">
            {results.map((event) => (
              <div key={event.id} className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-800">{event.content}</p>
                <div className="mt-2 flex justify-between text-sm text-gray-500">
                  <span>{event.pubkey.slice(0, 8)}...</span>
                  <span>{event.created_at ? new Date(event.created_at * 1000).toLocaleString() : 'Unknown date'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
