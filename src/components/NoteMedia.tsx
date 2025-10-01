'use client';

import { extractMediaFromContent, getSearchQueryFromMedia, isValidMediaUrl, getTrimmedMediaUrl } from '@/lib/utils/mediaUtils';
import ImageWithBlurhash from '@/components/ImageWithBlurhash';
import VideoWithBlurhash from '@/components/VideoWithBlurhash';
import UrlPreview from '@/components/UrlPreview';

interface NoteMediaProps {
  content: string;
  onSearch: (query: string) => void;
  onUrlLoaded: (url: string) => void;
}

export default function NoteMedia({ content, onSearch, onUrlLoaded }: NoteMediaProps) {
  const mediaItems = extractMediaFromContent(content);
  
  if (mediaItems.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-1 gap-3">
      {mediaItems.map((item) => {
        const key = `${item.type}-${item.index}-${item.src}`;
        
        if (item.type === 'image') {
          return (
            <div key={key} className="relative">
              {isValidMediaUrl(item.src) ? (
                <ImageWithBlurhash
                  src={getTrimmedMediaUrl(item.src)}
                  alt="linked media"
                  width={1024}
                  height={1024}
                  dim={null}
                  onClickSearch={() => onSearch(getSearchQueryFromMedia(item.src))}
                />
              ) : null}
            </div>
          );
        }
        
        if (item.type === 'video') {
          return (
            <div key={key} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
              <VideoWithBlurhash
                src={item.src}
                onClickSearch={() => onSearch(getSearchQueryFromMedia(item.src))}
              />
            </div>
          );
        }
        
        if (item.type === 'url') {
          return (
            <UrlPreview
              key={key}
              url={item.src}
              onLoaded={onUrlLoaded}
              onSearch={onSearch}
            />
          );
        }
        
        return null;
      })}
    </div>
  );
}
