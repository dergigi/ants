import { NDKUser } from '@nostr-dev-kit/ndk';
import Image from 'next/image';
import { shortenNpub, trimImageUrl } from '@/lib/utils';

interface ProfileScopeIndicatorProps {
  user: NDKUser | null;
  isEnabled: boolean;
  onToggle: () => void;
}

export default function ProfileScopeIndicator({ 
  user, 
  isEnabled, 
  onToggle 
}: ProfileScopeIndicatorProps) {
  if (!user) return null;

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onToggle}
        className={`w-10 h-10 rounded-lg overflow-hidden border transition-all duration-200 hover:opacity-80 ${
          isEnabled
            ? 'bg-[#3d3d3d] border-blue-400 shadow-sm'
            : 'bg-[#2d2d2d] border-gray-600 opacity-50 grayscale'
        }`}
        title={isEnabled ? 'Disable profile scoping' : 'Enable profile scoping'}
      >
        {user.profile?.image ? (
          <Image
            src={trimImageUrl(user.profile.image)}
            alt="Profile"
            width={40}
            height={40}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-300">
            {(user.profile?.displayName || user.profile?.name || shortenNpub(user.npub)).slice(0, 2).toUpperCase()}
          </div>
        )}
      </button>
    </div>
  );
}
