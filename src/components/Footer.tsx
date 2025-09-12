'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function Footer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleNostrClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextQuery = 'p:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', nextQuery);
    router.replace(`?${params.toString()}`);
  };

  const handleGitHubClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextQuery = 'https://github.com/dergigi/ants/';
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', nextQuery);
    router.replace(`?${params.toString()}`);
  };

  const handleSec04Click = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextQuery = 'SEC-04 #SovEng';
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', nextQuery);
    router.replace(`?${params.toString()}`);
  };

  const handleSec05Click = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextQuery = 'SEC-05 #SovEng';
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', nextQuery);
    router.replace(`?${params.toString()}`);
  };

  const handleVertexClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextQuery = 'p:npub1kpt95rv4q3mcz8e4lamwtxq7men6jprf49l7asfac9lnv2gda0lqdknhmz';
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', nextQuery);
    router.replace(`?${params.toString()}`);
  };

  const handleGigiClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextQuery = 'dergigi.com';
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', nextQuery);
    router.replace(`?${params.toString()}`);
  };

  return (
    <footer className="text-center text-xs text-gray-400 py-6 select-none bg-[#1a1a1a]">
      <p>
        Vibed with love by <a href="#" onClick={handleGigiClick} className="underline hover:text-gray-300">Gigi</a>.
      </p>
      <p className="mt-1">
        <a href="#" onClick={handleGitHubClick} className="underline hover:text-gray-300">GitHub</a>
        <span className="mx-2">·</span>
        <a href="#" onClick={handleNostrClick} className="underline hover:text-gray-300">Nostr</a>
        <span className="mx-2">·</span>
        <a href="#" onClick={handleSec04Click} className="underline hover:text-gray-300">Birthed during SEC-04</a>
        <span className="mx-2">·</span>
        <a href="#" onClick={handleSec05Click} className="underline hover:text-gray-300">Refined during SEC-05</a>
        <span className="mx-2">·</span>
        Using <a href="#" onClick={handleVertexClick} className="underline hover:text-gray-300">Vertex</a> DVM
      </p>
    </footer>
  );
}
