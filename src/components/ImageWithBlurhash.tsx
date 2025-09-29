import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Blurhash } from 'react-blurhash';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faExternalLink } from '@fortawesome/free-solid-svg-icons';
import { isAbsoluteHttpUrl, trimImageUrl } from '@/lib/utils/urlUtils';
import SearchIconButton from './SearchIconButton';
import ReverseImageSearchButton from './ReverseImageSearchButton';
import CopyButton from './CopyButton';

interface ImageWithBlurhashProps {
  src: string;
  blurhash?: string;
  alt: string;
  width: number;
  height: number;
  dim?: { width: number; height: number } | null;
  onClickSearch?: () => void;
}

export default function ImageWithBlurhash({ 
  src, 
  blurhash, 
  alt, 
  width, 
  height, 
  dim,
  onClickSearch
}: ImageWithBlurhashProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [measuredDim, setMeasuredDim] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setMeasuredDim(null);
  }, [src]);

  if (!isAbsoluteHttpUrl(src)) {
    return null;
  }

  const effectiveDim = dim && dim.width > 0 && dim.height > 0 ? dim : measuredDim;
  const aspectStyle = effectiveDim
    ? { aspectRatio: `${effectiveDim.width} / ${effectiveDim.height}` }
    : { minHeight: '200px' as const };

  return (
    <div 
      className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f] group"
      style={aspectStyle}
    >
      {/* Blurhash placeholder - shown while loading or on error */}
      {blurhash && (!imageLoaded || imageError) && (
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

      {/* Subtle loading spinner on top of blurhash while the image loads */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="h-6 w-6 rounded-full border-2 border-gray-300/70 border-t-transparent animate-spin"
            aria-label="Loading image"
          />
        </div>
      )}

      {/* Error state: show status code while keeping blurhash (if any) */}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="px-3 py-2 rounded-md bg-black/40 text-gray-200 text-sm flex items-center justify-center gap-2 border border-[#3d3d3d]">
            <FontAwesomeIcon icon={faImage} className="opacity-80" />
            <span className="flex-1 text-center">{statusCode ?? 'Error'}</span>
            <button
              type="button"
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Open image in new tab"
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
      
      {/* Real image - hidden until loaded */}
      <Image 
        src={trimImageUrl(src)} 
        alt={alt}
        width={width}
        height={height} 
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        unoptimized
        onLoad={(e) => { 
          setImageLoaded(true); 
          setStatusCode(200); 
          try {
            const img = e.currentTarget as HTMLImageElement;
            if (!effectiveDim && img?.naturalWidth && img?.naturalHeight) {
              setMeasuredDim({ width: img.naturalWidth, height: img.naturalHeight });
            }
          } catch {}
        }}
        onError={() => {
          setImageError(true);
          try {
            // Some browsers expose a 'naturalWidth' of 0 on 404 but no status code; try fetch HEAD
            fetch(src, { method: 'HEAD' }).then((res) => {
              setStatusCode(res.status || null);
            }).catch(() => setStatusCode(null));
          } catch { setStatusCode(null); }
        }}
      />
      
      {/* Search icon button - only show when image is loaded and onClickSearch is provided */}
      {imageLoaded && !imageError && onClickSearch && (
        <SearchIconButton
          onClick={onClickSearch}
          title="Search for this image"
        />
      )}
      
      {/* Reverse image search button - only show when image is loaded */}
      {imageLoaded && !imageError && (
        <ReverseImageSearchButton
          imageUrl={src}
        />
      )}

      {/* Copy image URL button - bottom right */}
      {imageLoaded && !imageError && (
        <div className="absolute bottom-1.5 right-1.5 z-10">
          <CopyButton 
            text={src} 
            title="Copy image URL" 
            className="w-7 h-7 text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200"
          />
        </div>
      )}

      {/* Open external button - bottom left */}
      {imageLoaded && !imageError && (
        <button
          type="button"
          className="absolute bottom-1.5 left-1.5 z-10 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200"
          title="Open image in new tab"
          onClick={(e) => {
            e.stopPropagation();
            window.open(src, '_blank', 'noopener,noreferrer');
          }}
        >
          <FontAwesomeIcon icon={faExternalLink} className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
