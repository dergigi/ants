'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import Image from 'next/image';
import EventCard from '@/components/EventCard';

type Props = {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  className?: string;
};

function getFirstTagValue(event: NDKEvent, tagName: string): string | undefined {
  try {
    const t = (event.tags || []).find((x) => Array.isArray(x) && x[0] === tagName);
    return t && t[1] ? String(t[1]) : undefined;
  } catch {
    return undefined;
  }
}

function formatBytes(size?: number): string | undefined {
  if (!size || isNaN(size) || size <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let s = size;
  let u = 0;
  while (s >= 1024 && u < units.length - 1) { s /= 1024; u++; }
  return `${s.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

function getFilenameFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const pathname = u.pathname || '';
    const last = pathname.split('/').filter(Boolean).pop() || '';
    return last || undefined;
  } catch {
    const cleaned = url.split(/[?#]/)[0];
    const parts = cleaned.split('/');
    return parts[parts.length - 1] || undefined;
  }
}

export default function FileCard({ event, onAuthorClick, className }: Props) {
  const url = getFirstTagValue(event, 'url') || undefined;
  const mime = getFirstTagValue(event, 'm') || undefined;
  const name = getFirstTagValue(event, 'name') || getFilenameFromUrl(url) || undefined;
  const sizeStr = getFirstTagValue(event, 'size');
  const size = sizeStr ? parseInt(sizeStr, 10) : undefined;
  const displaySize = formatBytes(size);
  const dim = getFirstTagValue(event, 'dim'); // e.g. 800x600
  const alt = (event.content || '').trim();

  const isImage = mime ? /^image\//i.test(mime) : (url ? /\.(?:png|jpe?g|gif|webp|avif|svg)(?:$|[?#])/i.test(url) : false);
  const isVideo = mime ? /^video\//i.test(mime) : (url ? /\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:$|[?#])/i.test(url) : false);
  const isAudio = mime ? /^audio\//i.test(mime) : (url ? /\.(?:mp3|wav|ogg|m4a|flac)(?:$|[?#])/i.test(url) : false);

  const renderMetaChips = () => (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-300">
      {mime && (<span className="px-2 py-0.5 rounded bg-[#3a3a3a] border border-[#4a4a4a]">{mime}</span>)}
      {displaySize && (<span className="px-2 py-0.5 rounded bg-[#3a3a3a] border border-[#4a4a4a]">{displaySize}</span>)}
      {dim && (<span className="px-2 py-0.5 rounded bg-[#3a3a3a] border border-[#4a4a4a]">{dim}</span>)}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-0.5 rounded bg-[#2d2d2d] border border-[#3d3d3d] text-blue-300 hover:text-blue-200 hover:bg-[#3a3a3a]"
          title={url}
        >
          Open
        </a>
      )}
    </div>
  );

  return (
    <EventCard
      event={event}
      onAuthorClick={onAuthorClick}
      className={className}
      renderContent={() => (
        <div className="text-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{name || 'File'}</div>
              {alt && (<div className="text-sm text-gray-300 mt-1 whitespace-pre-wrap break-words">{alt}</div>)}
            </div>
          </div>
          {renderMetaChips()}
        </div>
      )}
      mediaRenderer={() => (
        url ? (
          isImage ? (
            <div className="mt-3 rounded-md border border-[#3d3d3d] bg-[#1f1f1f] overflow-hidden">
              <Image src={url} alt={name || 'image'} width={1024} height={1024} className="h-auto w-full object-contain" unoptimized />
            </div>
          ) : isVideo ? (
            <div className="mt-3 rounded-md border border-[#3d3d3d] bg-[#1f1f1f] overflow-hidden">
              <video controls playsInline className="w-full h-auto">
                <source src={url} />
              </video>
            </div>
          ) : isAudio ? (
            <div className="mt-3 rounded-md border border-[#3d3d3d] bg-[#1f1f1f] overflow-hidden p-3">
              <audio controls className="w-full">
                <source src={url} />
              </audio>
            </div>
          ) : null
        ) : null
      )}
    />
  );
}


