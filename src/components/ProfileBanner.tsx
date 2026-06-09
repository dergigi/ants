'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import TitleBarButton from '@/components/TitleBarButton';

type Props = {
  bannerUrl?: string;
};

/** Collapsible profile banner with back/minimize/maximize/close title bar buttons */
export default function ProfileBanner({ bannerUrl }: Props) {
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const router = useRouter();

  if (!bannerUrl) {
    return (
      <div className="relative w-full border-b border-[#3d3d3d] bg-[#2d2d2d] rounded-t-lg" style={{ height: 32 }}>
        <div className="absolute top-1 left-1 z-50 flex gap-1">
          <TitleBarButton
            icon={faArrowLeft}
            title="Go back"
            onClick={() => router.back()}
          />
        </div>
        <div className="absolute top-1 right-1 flex gap-1">
          <TitleBarButton
            title="Close"
            textSize="text-[10px]"
            onClick={() => router.push('/')}
          >
            ×
          </TitleBarButton>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setBannerExpanded((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setBannerExpanded((prev) => !prev);
        }
      }}
      className="block w-full focus:outline-none"
      aria-expanded={bannerExpanded}
      title={bannerExpanded ? 'Collapse banner' : 'Expand banner'}
    >
      <div
        className="relative w-full border-b border-[#3d3d3d]"
        style={{ height: bannerExpanded ? 240 : 32 }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <Image src={bannerUrl} alt="Banner" fill className="object-cover" unoptimized />
        </div>
        <div className="absolute top-1 left-1 z-50 flex gap-1">
          <TitleBarButton
            icon={faArrowLeft}
            title="Go back"
            onClick={() => router.back()}
          />
        </div>
        <div className="absolute top-1 right-1 flex gap-1">
          <TitleBarButton
            title="Minimize"
            textSize="text-[10px]"
            onClick={() => setBannerExpanded(false)}
          >
            –
          </TitleBarButton>
          <TitleBarButton
            title="Maximize"
            textSize="text-[10px]"
            onClick={() => {
              window.open(bannerUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            ▢
          </TitleBarButton>
          <TitleBarButton
            title="Close"
            textSize="text-[10px]"
            onClick={() => router.push('/')}
          >
            ×
          </TitleBarButton>
        </div>
      </div>
    </div>
  );
}
