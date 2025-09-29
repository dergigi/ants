'use client';

import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLink } from '@fortawesome/free-solid-svg-icons';

export function Footer() {
  const router = useRouter();

  // DRY: Reusable function for search navigation - always go to root
  const handleSearchClick = (query: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.replace(`/?q=${encodeURIComponent(query)}`);
  };

  const handleGitHubExternalClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open('https://github.com/dergigi/ants/issues/new', '_blank', 'noopener,noreferrer');
  };

  return (
    <footer className="text-center text-xs text-gray-400 py-6 select-none bg-[#1a1a1a]">
      <p>
        Vibed by{' '}
        <a href="#" onClick={handleSearchClick('dergigi.com')} className="underline hover:text-gray-300">
          Gigi
        </a>
        <span className="mx-2">·</span>
        Birthed during{' '}
        <a
          href="#"
          onClick={handleSearchClick('(#SovEng OR by:sovereignengineering.io)')}
          className="underline hover:text-gray-300"
        >
          SEC-04
        </a>
        <span className="mx-2">·</span>
        Using{' '}
        <a href="#" onClick={handleSearchClick('p:npub1kpt95rv4q3mcz8e4lamwtxq7men6jprf49l7asfac9lnv2gda0lqdknhmz')} className="underline hover:text-gray-300">
          Vertex
        </a>
      </p>
      <p className="mt-1">
        <a href="#" onClick={handleSearchClick('"dergigi/ants"')} className="underline hover:text-gray-300">
          GitHub
          <button
            type="button"
            onClick={handleGitHubExternalClick}
            className="ml-1 text-gray-400 hover:text-gray-300"
            title="Open GitHub issues"
          >
            <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3" />
          </button>
        </a>
        <span className="mx-2">·</span>
        <a href="#" onClick={handleSearchClick('p:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc')} className="underline hover:text-gray-300">
          Nostr
        </a>
      </p>
    </footer>
  );
}
