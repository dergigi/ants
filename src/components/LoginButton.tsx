'use client';

import { login, restoreLogin, logout } from '@/lib/nip07';
import { useState, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';

function shortenNpub(npub: string) {
  if (!npub) return '';
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
      {user ? shortenNpub(user.npub) : 'login'}
    </button>
  );
} 