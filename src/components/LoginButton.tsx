'use client';

import { login, restoreLogin } from '@/lib/nip07';
import { useState, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { useRouter } from 'next/navigation';
import ProfileImage from '@/components/ProfileImage';

export function LoginButton() {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

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

  const handleLogin = async () => {
    try {
      const loggedInUser = await login();
      if (loggedInUser) {
        // Fetch the user's profile to get the display name
        await loggedInUser.fetchProfile();
        setUser(loggedInUser);
        console.log('Logged in successfully');
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleAvatarClick = () => {
    if (user) {
      router.push(`/p/${user.npub}`);
      return;
    }
    void handleLogin();
  };

  if (isLoading) {
    return (
      <button
        disabled
        className="fixed top-4 right-4 text-sm text-gray-400 transition-colors"
      >
        loading...
      </button>
    );
  }

  return (
    <button
      id="header-avatar"
      onClick={handleAvatarClick}
      className="fixed top-4 right-4 hover:opacity-90 transition-opacity"
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
        <span className="text-sm text-gray-400 hover:text-gray-200">login</span>
      )}
    </button>
  );
} 