'use client';

import { useState } from 'react';

export default function Home() {
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    // TODO: Implement search functionality
    console.log('Searching for:', query);
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
        />
        <button
          onClick={handleSearch}
          className="w-full px-4 py-2 bg-white text-black rounded hover:bg-gray-100 transition-colors"
        >
          Search
        </button>
      </div>
    </main>
  );
}
