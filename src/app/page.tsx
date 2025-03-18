'use client';

import { useState, useEffect } from 'react';
import { ndk, connect } from '@/lib/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { lookupVertexProfile, VERTEX_REGEXP } from '@/lib/vertex';

const searchExamples = [
  'p:fiatjaf',
  'vibe coding',
  '#penisButter',
  'from:pablo ndk'
];

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [placeholder] = useState(() => searchExamples[Math.floor(Math.random() * searchExamples.length)]);

  useEffect(() => {
    connect();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const searchQuery = query.trim() || 'vibe';
      
      // Check if this is a Vertex profile lookup
      if (VERTEX_REGEXP.test(searchQuery)) {
        const profile = await lookupVertexProfile(searchQuery);
        setResults(profile ? [profile] : []);
      } else {
        // Regular search
        const events = await ndk.fetchEvents({
          kinds: [1],
          search: searchQuery,
          limit: 21
        });
        setResults(Array.from(events));
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className={`max-w-2xl mx-auto px-4 ${results.length > 0 ? 'pt-4' : 'min-h-screen flex items-center'}`}>
        <form onSubmit={handleSearch} className="w-full">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="flex-1 px-4 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] text-gray-100 placeholder-gray-400"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-[#3d3d3d] text-gray-100 rounded-lg hover:bg-[#4d4d4d] focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {results.length > 0 && (
          <div className="mt-8 space-y-4">
            {results.map((event) => (
              <div key={event.id} className="p-4 bg-[#2d2d2d] rounded-lg border border-[#3d3d3d]">
                {event.kind === 0 ? (
                  // Profile metadata
                  <div>
                    <div className="flex items-center gap-4">
                      {JSON.parse(event.content).picture && (
                        <img 
                          src={JSON.parse(event.content).picture} 
                          alt="Profile" 
                          className="w-16 h-16 rounded-full"
                        />
                      )}
                      <div>
                        <h2 className="text-xl font-bold">
                          {JSON.parse(event.content).display_name || JSON.parse(event.content).displayName || JSON.parse(event.content).name}
                        </h2>
                        <p className="text-gray-400">npub{event.pubkey.slice(0, 8)}...</p>
                      </div>
                    </div>
                    {JSON.parse(event.content).about && (
                      <p className="mt-4 text-gray-300">{JSON.parse(event.content).about}</p>
                    )}
                  </div>
                ) : (
                  // Regular note
                  <>
                    <p className="text-gray-100">{event.content}</p>
                    <div className="mt-2 flex justify-between text-sm text-gray-400">
                      <span>{event.pubkey.slice(0, 8)}...</span>
                      <span>{event.created_at ? formatDate(event.created_at) : 'Unknown date'}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
