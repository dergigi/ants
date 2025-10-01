import { useState, useEffect } from 'react';
import { Blurhash } from 'react-blurhash';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faExternalLink } from '@fortawesome/free-solid-svg-icons';
import { isAbsoluteHttpUrl } from '@/lib/utils/urlUtils';
import SearchIconButton from './SearchIconButton';
import ReverseImageSearchButton from './ReverseImageSearchButton';

interface VideoWithBlurhashProps {
  src: string;
  blurhash?: string;
  dim?: { width: number; height: number } | null;
  onClickSearch?: () => void;
}

export default function VideoWithBlurhash({ 
  src, 
  blurhash, 
  dim,
  onClickSearch
}: VideoWithBlurhashProps) {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  useEffect(() => {
    setVideoLoaded(false);
    setVideoError(false);
  }, [src]);

  if (!isAbsoluteHttpUrl(src)) {
    return null;
  }

  const aspectStyle = dim && dim.width > 0 && dim.height > 0
    ? { aspectRatio: `${dim.width} / ${dim.height}` }
    : { minHeight: '200px' as const };

  return (
    <div 
      className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f] group"
      style={aspectStyle}
    >
      {/* Blurhash placeholder - shown while loading or on error */}
      {blurhash && (!videoLoaded || videoError) && (
        <div className="absolute inset-0">
          <Blurhash 
            hash={blurhash} 
            width={'100%'} 
            height={'100%'} 
            resolutionX={32} 
            resolutionY={32} 
            punch={1} 
          />
        </div>
      )}

      {/* Subtle loading spinner on top of blurhash while the video loads */}
      {!videoLoaded && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="h-6 w-6 rounded-full border-2 border-gray-300/70 border-t-transparent animate-spin"
            aria-label="Loading video"
          />
        </div>
      )}

      {/* Error state: show status code while keeping blurhash (if any) */}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="px-3 py-2 rounded-md bg-black/40 text-gray-200 text-sm flex items-center justify-center gap-2 border border-[#3d3d3d]">
            <FontAwesomeIcon icon={faImage} className="opacity-80" />
            <span className="flex-1 text-center">{statusCode ?? 'Error'}</span>
            <button
              type="button"
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Open video in new tab"
              onClick={(e) => {
                e.stopPropagation();
                window.open(src, '_blank', 'noopener,noreferrer');
              }}
            >
              <FontAwesomeIcon icon={faExternalLink} className="text-xs opacity-80" />
            </button>
          </div>
        </div>
      )}
      
      {/* Real video - hidden until loaded */}
      <video 
        controls 
        playsInline 
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          videoLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoadedData={() => { setVideoLoaded(true); setStatusCode(200); }}
        onError={() => {
          try {
            // Try to fetch HEAD to get status code
            fetch(src, { method: 'HEAD' }).then((res) => {
              setStatusCode(res.status || null);
              // Only treat actual HTTP error codes as errors (4xx, 5xx)
              if (res.status >= 400) {
                setVideoError(true);
              }
            }).catch(() => {
              setStatusCode(null);
              setVideoError(true);
            });
          } catch { 
            setStatusCode(null);
            setVideoError(true);
          }
        }}
      >
        <source src={src} />
        Your browser does not support the video tag.
      </video>
      
      {/* Search icon button - only show when video is loaded and onClickSearch is provided */}
      {videoLoaded && !videoError && onClickSearch && (
        <SearchIconButton
          onClick={onClickSearch}
          title="Search for this video"
        />
      )}
      
      {/* Reverse image search button - only show when video is loaded */}
      {videoLoaded && !videoError && (
        <ReverseImageSearchButton
          imageUrl={src}
        />
      )}
    </div>
  );
}
