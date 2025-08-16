'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { connect, getCurrentExample } from '@/lib/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { lookupVertexProfile, VERTEX_REGEXP } from '@/lib/vertex';
import { searchEvents } from '@/lib/search';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';

function SearchComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [placeholder, setPlaceholder] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [loadingDots, setLoadingDots] = useState('...');
  const currentSearchId = useRef(0);

  const handleCopyNpub = async (npub: string) => {
    await navigator.clipboard.writeText(npub);
  };

  const handleSearch = useCallback(async (searchQuery: string) => {
    const localSearchId = ++currentSearchId.current;
    setIsLoading(true);
    
    try {
      // If the field is empty, use the current placeholder
      if (!searchQuery.trim()) {
        searchQuery = placeholder;
      }
      
      console.log('Search details:', {
        inputValue: searchQuery,
        placeholder,
        searchQuery,
        usingPlaceholder: !searchQuery.trim()
      });
      
      // Check if this is a Vertex profile lookup
      if (VERTEX_REGEXP.test(searchQuery)) {
        const profile = await lookupVertexProfile(searchQuery);
        if (profile) {
          // Store the npub in local storage
          const npub = profile.author.npub;
          localStorage.setItem(`profile_${searchQuery}`, npub);
          // Set results immediately to trigger UI update
          if (localSearchId === currentSearchId.current) {
            setResults([profile]);
            setIsLoading(false);
          }
          // Update URL to reflect the profile view
          const params = new URLSearchParams(searchParams.toString());
          params.set('q', searchQuery);
          router.replace(`?${params.toString()}`);
        } else {
          if (localSearchId === currentSearchId.current) {
            setResults([]);
            setIsLoading(false);
          }
        }
      } else {
        // Regular search or author-filtered search
        const events = await searchEvents(searchQuery);
        if (localSearchId === currentSearchId.current) {
          setResults(events);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      if (localSearchId === currentSearchId.current) {
        setResults([]);
      }
    } finally {
      if (localSearchId === currentSearchId.current) {
        setIsLoading(false);
      }
    }
  }, [placeholder, router, searchParams]);

  // Loading animation effect
  useEffect(() => {
    if (!isConnecting) return;
    
    const interval = setInterval(() => {
      setLoadingDots(prev => {
        switch (prev) {
          case '': return '.';
          case '.': return '..';
          case '..': return '...';
          default: return '.';
        }
      });
    }, 21);

    return () => clearInterval(interval);
  }, [isConnecting]);

  useEffect(() => {
    const initializeNDK = async () => {
      setIsConnecting(true);
      await connect();
      setPlaceholder(getCurrentExample());
      setIsConnecting(false);
    };
    initializeNDK();
  }, []);

  // Initialize query from URL on mount
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery && urlQuery !== query) {
      setQuery(urlQuery);
      // Only perform search if this is a direct URL access
      if (!query) {
        handleSearch(urlQuery);
      }
    }
  }, [searchParams, handleSearch, query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // If query is empty, use placeholder
    const searchQuery = query.trim() || placeholder;
    setQuery(searchQuery);
    
    // Update URL with current query
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set('q', searchQuery);
      router.replace(`?${params.toString()}`);
      // Perform the search
      handleSearch(searchQuery);
    } else {
      params.delete('q');
      router.replace(`?${params.toString()}`);
      setResults([]);
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

  const shortenNpub = (npub: string) => {
    if (!npub) return '';
    return `${npub.substring(0, 10)}...${npub.substring(npub.length - 3)}`;
  };

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className={`max-w-2xl mx-auto px-4 ${results.length > 0 ? 'pt-4' : 'min-h-screen flex items-center'}`}>
        <form onSubmit={handleSubmit} className="w-full">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isConnecting ? loadingDots : placeholder}
                className="w-full px-4 py-2 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4d4d4d] text-gray-100 placeholder-gray-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    currentSearchId.current++;
                    setQuery('');
                    setResults([]);
                    // Update URL to remove the query parameter
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete('q');
                    router.replace(`?${params.toString()}`);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
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
                      {event.author.profile?.image && (
                        <Image 
                          src={event.author.profile.image}
                          alt="Profile" 
                          width={64}
                          height={64}
                          className="rounded-full"
                        />
                      )}
                      <div>
                        <h2 className="text-xl font-bold">
                          {event.author.profile?.displayName || event.author.profile?.name}
                        </h2>
                        <button
                          onClick={() => handleCopyNpub(event.author.npub)}
                          className="text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          {shortenNpub(event.author.npub)}
                        </button>
                      </div>
                    </div>
                    {event.author.profile?.about && (
                      <p className="mt-4 text-gray-300">{event.author.profile.about}</p>
                    )}
                  </div>
                ) : (
                  // Regular note
                  <>
                    <p className="text-gray-100">{event.content}</p>
                    <div className="mt-2 flex justify-between text-sm text-gray-400">
                      <button
                        onClick={() => handleCopyNpub(event.author.npub)}
                        className="hover:text-gray-200 transition-colors"
                      >
                        {shortenNpub(event.author.npub)}
                      </button>
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

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchComponent />
    </Suspense>
  );
}
