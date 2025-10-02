import { NDKUser } from '@nostr-dev-kit/ndk';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import ProfileImage from '@/components/ProfileImage';
import { getIsKindTokens } from '@/lib/search/replacements';
import { calculateAbsoluteMenuPosition } from '@/lib/utils';
import { getProfileScopeIdentifiers } from '@/lib/search/profileScope';
import { toImplicitUrlQuery } from '@/lib/search/queryTransforms';

interface ProfileScopeIndicatorProps {
  user: NDKUser | null;
  isEnabled: boolean;
  onToggle: () => void;
}

export default function ProfileScopeIndicator({ 
  user, 
  isEnabled 
}: Omit<ProfileScopeIndicatorProps, 'onToggle'>) {
  const router = useRouter();
  const [quickSearchItems, setQuickSearchItems] = useState<string[]>([]);
  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokens = await getIsKindTokens();
        if (!cancelled) setQuickSearchItems(tokens);
      } catch {
        if (!cancelled) setQuickSearchItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!user) return null;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const position = calculateAbsoluteMenuPosition(rect);
      setMenuPosition(position);
    }
    setShowPortalMenu((v) => !v);
  };

  return (
    <div className="flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        className={`w-10 h-10 rounded-lg overflow-hidden border transition-all duration-200 hover:opacity-80 ${
          isEnabled
            ? 'bg-[#3d3d3d] border-blue-400 shadow-sm'
            : 'bg-[#2d2d2d] border-gray-600 opacity-50 grayscale'
        }`}
        title="Filter options"
      >
        <ProfileImage 
          user={user} 
          size={40}
          className="w-full h-full object-cover"
          fallbackClassName="w-full h-full flex items-center justify-center text-xs text-gray-300"
        />
      </button>
      {showPortalMenu && typeof window !== 'undefined' && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => { e.preventDefault(); setShowPortalMenu(false); }}
          />
          <div
            className="fixed z-[9999] w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <ul className="py-1 text-sm text-gray-200">
              {quickSearchItems.map((token) => (
                <li key={token}>
                  <button
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-[#3a3a3a]"
                    onClick={(e) => {
                      e.stopPropagation();
                const identifiers = getProfileScopeIdentifiers(user, user.npub);
                if (!identifiers) return;
                const explicit = `${token} by:${identifiers.profileIdentifier}`.trim();
                const implicit = toImplicitUrlQuery(explicit, identifiers.npub);
                const params = new URLSearchParams();
                params.set('q', implicit);
                router.push(`/p/${identifiers.npub}?${params.toString()}`);
                      setShowPortalMenu(false);
                    }}
                  >
                    {token}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
