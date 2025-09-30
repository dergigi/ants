'use client';

import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

export default function AuthorBadge({ user, onAuthorClick }: { user: NDKUser, onAuthorClick?: (npub: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    let isMounted = true;
    // Use any already-known profile data immediately
    const initial = user.profile?.displayName || user.profile?.name || '';
    setName(initial);
    setLoaded(true);
    (async () => {
      try {
        await user.fetchProfile();
      } catch {}
      if (!isMounted) return;
      const display = user.profile?.displayName || user.profile?.name || '';
      setName(display);
    })();
    return () => { isMounted = false; };
  }, [user]);

  return (
    <div className="flex items-center gap-2">
      {loaded ? (
        <button
          type="button"
          onClick={() => onAuthorClick && onAuthorClick(user.npub)}
          className="font-medium text-gray-100 hover:underline truncate max-w-[10rem] text-left"
          title={name || 'Unknown'}
        >
          {name || 'Unknown'}
        </button>
      ) : (
        <span className="font-medium text-gray-100 truncate max-w-[10rem] flex items-center gap-1">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
          Loading...
        </span>
      )}
    </div>
  );
}


