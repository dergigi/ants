import { NDKUser } from '@nostr-dev-kit/ndk';
import { shortenNpub } from './utils';

export function getDisplayName(user: NDKUser): string {
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
  return shortenNpub(npub);
}
