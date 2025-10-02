'use client';

import { restoreLogin } from '@/lib/nip07';
import { useState, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ProfileImage from '@/components/ProfileImage';
import { useLoginTrigger } from '@/lib/LoginTrigger';
import { useClearTrigger } from '@/lib/ClearTrigger';

export function Header() {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { triggerLogin } = useLoginTrigger();
  const { triggerClear } = useClearTrigger();

  // Restore login state on mount
  useEffect(() => {
    const initLogin = async () => {
      try {
        const restoredUser = await restoreLogin();
        if (restoredUser) {
          // Fetch the user's profile to get the display name
          await restoredUser.fetchProfile();
        }
        setUser(restoredUser);
      } catch (error) {
        console.error('Failed to restore login:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initLogin();
    // Listen for external auth changes (e.g., slash-commands)
    const onAuthChange = () => {
      (async () => {
        try {
          const u = await restoreLogin();
          if (u) {
            try { await u.fetchProfile(); } catch {}
          }
          setUser(u);
        } catch {
          setUser(null);
        }
      })();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('nip07:auth-change', onAuthChange as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('nip07:auth-change', onAuthChange as EventListener);
      }
    };
  }, []);

  const handleAvatarClick = () => {
    if (user) {
      router.push(`/p/${user.npub}`);
      return;
    }
    // Trigger the /login command in SearchView
    triggerLogin();
  };

  const handleFaviconClick = () => {
    // Navigate to search for dergigi/ants by:dergigi
    router.push('/?q=dergigi%2Fants%20by%3Adergigi');
  };

  if (isLoading) {
    return (
      <header className="flex items-center justify-between px-4 py-1 bg-[#1a1a1a] border-b border-[#2d2d2d]">
        {/* Favicon on the left */}
        <button
          onClick={handleFaviconClick}
          className="hover:opacity-90 transition-opacity"
          aria-label="Go to home page"
        >
          <Image 
            src="/ants-menu.png" 
            alt="ants menu" 
            width={20}
            height={20}
            className="w-5 h-5"
          />
        </button>
        
        {/* Loading spinner on the right */}
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between px-4 py-1 bg-[#1a1a1a] border-b border-[#2d2d2d]">
      {/* Favicon on the left */}
      <button
        onClick={handleFaviconClick}
        className="hover:opacity-90 transition-opacity"
        aria-label="Go to home page"
      >
        <Image 
          src="/ants-menu.png" 
          alt="ants menu" 
          width={20}
          height={20}
          className="w-5 h-5"
        />
      </button>
      
      {/* Login button on the right */}
      <button
        id="header-avatar"
        onClick={handleAvatarClick}
        className="hover:opacity-90 transition-opacity"
        aria-label={user ? 'Open profile page' : 'login'}
      >
        {user ? (
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#3d3d3d] border border-[#3d3d3d]">
            <ProfileImage 
              user={user} 
              size={40}
              className="w-full h-full object-cover"
              fallbackClassName="w-full h-full flex items-center justify-center text-xs text-gray-300"
            />
          </div>
        ) : (
          <span className="text-xs text-gray-400 hover:text-gray-200">login</span>
        )}
      </button>
    </header>
  );
}
