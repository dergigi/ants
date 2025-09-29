'use client';

import { useCallback } from 'react';
import { isAbsoluteHttpUrl, getFilenameFromUrl } from '@/lib/utils/urlUtils';
import { extractImageUrls, extractVideoUrls, extractNonMediaUrls } from '@/lib/utils/urlUtils';
import { trimImageUrl } from '@/lib/utils';
import ImageWithBlurhash from '@/components/ImageWithBlurhash';
import VideoWithBlurhash from '@/components/VideoWithBlurhash';
import UrlPreview from '@/components/UrlPreview';

interface NoteMediaProps {
  content: string;
  onSearch: (query: string) => void;
  onUrlLoaded: (url: string) => void;
  successfulPreviews: Set<string>;
}

export default function NoteMedia({ 
  content, 
  onSearch, 
  onUrlLoaded, 
  successfulPreviews 
}: NoteMediaProps) {
  const extractImageUrlsFromText = useCallback((text: string): string[] => {
    return extractImageUrls(text).slice(0, 3);
  }, []);

  const extractVideoUrlsFromText = useCallback((text: string): string[] => {
    return extractVideoUrls(text).slice(0, 2);
  }, []);

  const extractNonMediaUrlsFromText = (text: string): string[] => {
    return extractNonMediaUrls(text).slice(0, 2);
  };

  return (
    <>
      {extractImageUrlsFromText(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractImageUrlsFromText(content).map((src, index) => {
            const trimmedSrc = src.trim();
            return (
              <div key={`image-${index}-${trimmedSrc}`} className="relative">
                {isAbsoluteHttpUrl(trimmedSrc) ? (
                  <ImageWithBlurhash
                    src={trimImageUrl(trimmedSrc)}
                    alt="linked media"
                    width={1024}
                    height={1024}
                    dim={null}
                    onClickSearch={() => {
                      const filename = getFilenameFromUrl(trimmedSrc);
                      onSearch(filename);
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {extractVideoUrlsFromText(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractVideoUrlsFromText(content).map((src, index) => {
            const trimmedSrc = src.trim();
            return (
              <div key={`video-${index}-${trimmedSrc}`} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
                <video controls playsInline className="w-full h-auto">
                  <source src={trimmedSrc} />
                  Your browser does not support the video tag.
                </video>
              </div>
            );
          })}
        </div>
      )}
      {extractNonMediaUrlsFromText(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractNonMediaUrlsFromText(content).map((u, index) => (
            <UrlPreview
              key={`url-${index}-${u}`}
              url={u}
              onLoaded={(loadedUrl) => {
                onUrlLoaded(loadedUrl);
              }}
              onSearch={(targetUrl) => {
                onSearch(targetUrl);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
