'use client';

import { login } from '@/lib/nip07';
import { useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';

function shortenNpub(npub: string) {
  if (!npub) return '';
  return `${npub.substring(0, 10)}...${npub.substring(npub.length - 3)}`;
}

export function LoginButton() {
  const [user, setUser] = useState<NDKUser | null>(null);

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

  return (
    <button
      onClick={handleLogin}
      className="fixed top-4 right-4 text-sm text-gray-400 hover:text-gray-200 transition-colors"
    >
      {user ? shortenNpub(user.npub) : 'login'}
    </button>
  );
} 