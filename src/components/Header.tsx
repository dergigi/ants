'use client';

import { restoreLogin } from '@/lib/nip07';
import { useState, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { useRouter } from 'next/navigation';
import ProfileImage from '@/components/ProfileImage';
import Logo from '@/components/Logo';
import { useLoginTrigger } from '@/lib/LoginTrigger';

export function Header() {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Force re-render of avatar when profile data updates on the same NDKUser instance
  const [avatarVersion, setAvatarVersion] = useState(0);
  const router = useRouter();
  const { triggerLogin, loginState, setLoginState, currentUser } = useLoginTrigger();

  // Restore login state on mount
  useEffect(() => {
    const initLogin = async () => {
      try {
        const restoredUser = await restoreLogin();
        // Set user immediately for fast UI feedback
        setUser(restoredUser);
        if (restoredUser) {
          setLoginState('logged-in');
          // Fetch the user's profile in the background to update display details
          try { 
            await restoredUser.fetchProfile();
            // Bump avatar version to force a re-render even if the user object identity is unchanged
            setAvatarVersion(v => v + 1);
            setUser(restoredUser);
          } catch {}
        } else {
          setLoginState('logged-out');
        }
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
          // Set user immediately so header reflects login state right away
          setUser(u);
          if (u) {
            try { 
              await u.fetchProfile();
              // Bump avatar version to force a re-render even if the user object identity is unchanged
              setAvatarVersion(v => v + 1);
              setUser(u);
            } catch {}
          }
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
  }, [setLoginState]);

  // Respond to login state changes immediately
  useEffect(() => {
    if (loginState === 'logging-in') {
      // Show loading state immediately when login starts
      setIsLoading(true);
    } else if (loginState === 'logged-in' && currentUser) {
      // When login succeeds, use the current user immediately
      setUser(currentUser);
      setIsLoading(false);
    } else if (loginState === 'logged-out') {
      // When logged out, clear user immediately
      setUser(null);
      setIsLoading(false);
    }
  }, [loginState, currentUser]);

  const handleAvatarClick = () => {
    if (user) {
      router.push(`/p/${user.npub}`);
      return;
    }
    // Trigger the /login command in SearchView
    triggerLogin();
  };

  const handleFaviconClick = () => {
    // Navigate to search for /help
    router.push('/?q=%2Fhelp');
  };

  if (isLoading) {
    return (
      <header className="flex items-center justify-between px-4 py-1 bg-[#1a1a1a] border-b border-[#2d2d2d]">
        {/* Favicon on the left */}
        <Logo 
          size="small"
          onClick={handleFaviconClick}
        />
        
        {/* Loading spinner on the right */}
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between px-4 py-1 bg-[#1a1a1a] border-b border-[#2d2d2d]">
      {/* Logo on the left */}
      <Logo 
        size={user ? 'large' : 'small'}
        onClick={handleFaviconClick}
        isActive={!!user}
      />
      
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
              key={`${user.pubkey}-${avatarVersion}`}
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
