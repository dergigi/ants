'use client';

import { login, restoreLogin, logout } from '@/lib/nip07';
import { useState, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';

function getDisplayName(user: NDKUser): string {
  if (!user) return '';
  
  // Try to get display name from profile
  const profile = user.profile;
  if (profile?.displayName) {
    return profile.displayName;
  }
  if (profile?.name) {
    return profile.name;
  }
  
  // Fallback to shortened npub
  const npub = user.npub;
  return `${npub.substring(0, 10)}...${npub.substring(npub.length - 3)}`;
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

  const handleLogout = () => {
    logout();
    setUser(null);
    console.log('Logged out successfully');
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
      onClick={user ? handleLogout : handleLogin}
      className="fixed top-4 right-4 text-sm text-gray-400 hover:text-gray-200 transition-colors"
    >
      {user ? getDisplayName(user) : 'login'}
    </button>
  );
} 