'use client';

import { login } from '@/lib/nip07';
import { useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';

function shortenNpub(npub: string) {
  if (!npub) return '';
  return `${npub.substring(0, 10)}...${npub.substring(npub.length - 3)}`;
}

export function LoginButton() {
  const [pubkey, setPubkey] = useState<string | null>(null);

  const handleLogin = async () => {
    const signer = await login();
    if (signer) {
      const userPubkey = await signer.user();
      const user = new NDKUser({ pubkey: userPubkey });
      setPubkey(user.npub);
      console.log('Logged in successfully');
    }
  };

  return (
    <button
      onClick={handleLogin}
      className="fixed top-4 right-4 text-sm text-gray-400 hover:text-gray-200 transition-colors"
    >
      {pubkey ? shortenNpub(pubkey) : 'login'}
    </button>
  );
} 