import { extractImageUrls, extractVideoUrls, extractNonMediaUrls } from '@/lib/utils/urlUtils';
import { isAbsoluteHttpUrl, getFilenameFromUrl } from '@/lib/utils/urlUtils';
import { trimImageUrl } from '@/lib/utils';

export interface MediaItem {
  type: 'image' | 'video' | 'url';
  src: string;
  index: number;
}

export const extractMediaFromContent = (content: string): MediaItem[] => {
  const items: MediaItem[] = [];
  
  // Extract images (limit to 3)
  extractImageUrls(content).slice(0, 3).forEach((src, index) => {
    items.push({ type: 'image', src: src.trim(), index });
  });
  
  // Extract videos (limit to 2)
  extractVideoUrls(content).slice(0, 2).forEach((src, index) => {
    items.push({ type: 'video', src: src.trim(), index });
  });
  
  // Extract non-media URLs (limit to 2)
  extractNonMediaUrls(content).slice(0, 2).forEach((src, index) => {
    items.push({ type: 'url', src: src.trim(), index });
  });
  
  return items;
};

export const getSearchQueryFromMedia = (src: string): string => {
  return getFilenameFromUrl(src);
};

export const isValidMediaUrl = (src: string): boolean => {
  return isAbsoluteHttpUrl(src);
};

export const getTrimmedMediaUrl = (src: string): string => {
  return trimImageUrl(src);
};
