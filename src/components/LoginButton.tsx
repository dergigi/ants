'use client';

import { login, restoreLogin, logout } from '@/lib/nip07';
import { useState, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import Image from 'next/image';

function shortenNpub(npub: string) {
  if (!npub) return '';
  return `${npub.substring(0, 10)}...${npub.substring(npub.length - 3)}`;
}

function getInitials(user: NDKUser): string {
  const name = user.profile?.displayName || user.profile?.name || '';
  if (!name) return '?';
  
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function LoginButton() {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore login state on mount
  useEffect(() => {
    const initLogin = async () => {
      try {
        const restoredUser = await restoreLogin();
        if (restoredUser) {
          // Fetch the user's profile to get the image
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
  }, []);

  const handleLogin = async () => {
    try {
      const loggedInUser = await login();
      if (loggedInUser) {
        // Fetch the user's profile to get the image
        await loggedInUser.fetchProfile();
        setUser(loggedInUser);
        console.log('Logged in successfully');
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    console.log('Logged out successfully');
  };

  if (isLoading) {
    return (
      <button
        disabled
        className="fixed top-4 right-4 w-10 h-10 bg-gray-600 rounded-lg flex items-center justify-center text-sm text-gray-400 transition-colors"
      >
        ...
      </button>
    );
  }

  return (
    <button
      onClick={user ? handleLogout : handleLogin}
      className="fixed top-4 right-4 w-10 h-10 rounded-lg overflow-hidden border border-gray-600 hover:border-gray-400 transition-colors"
      title={user ? (user.profile?.displayName || user.profile?.name || shortenNpub(user.npub)) : 'Login'}
    >
      {user ? (
        user.profile?.image ? (
          <Image
            src={user.profile.image}
            alt="Profile"
            width={40}
            height={40}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
            {getInitials(user)}
          </div>
        )
      ) : (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      )}
    </button>
  );
} 