'use client';

import { Suspense } from 'react';
import SearchView from '@/components/SearchView';

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
        <div className="max-w-2xl mx-auto px-4 min-h-screen flex items-center w-full">
          <SearchView manageUrl={true} />
        </div>
      </main>
    </Suspense>
  );
}


