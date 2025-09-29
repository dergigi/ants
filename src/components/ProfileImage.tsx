'use client';

import Image from 'next/image';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { trimImageUrl } from '@/lib/utils';
import { getDisplayName } from '@/lib/utils/profileUtils';

interface ProfileImageProps {
  user: NDKUser;
  size?: number;
  className?: string;
  alt?: string;
  fallbackClassName?: string;
}

export default function ProfileImage({ 
  user, 
  size = 40, 
  className = "w-full h-full object-cover",
  alt = "Profile",
  fallbackClassName = "w-full h-full flex items-center justify-center text-xs text-gray-300"
}: ProfileImageProps) {
  const avatarUrl = user.profile?.image;
  const showAvatar = typeof avatarUrl === 'string' && /^https?:\/\//i.test(avatarUrl);
  
  if (!showAvatar) {
    return (
      <div className={fallbackClassName}>
        {getDisplayName(user).slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={trimImageUrl(avatarUrl)}
      alt={alt}
      width={size}
      height={size}
      className={className}
      unoptimized
    />
  );
}
