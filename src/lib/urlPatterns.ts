// Common URL and media pattern utilities (keep DRY)

// Generic URL finder
export const URL_REGEX = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;

// Image extensions
export const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg)(?:$|[?#])/i;

// Video extensions
export const VIDEO_EXT_REGEX = /\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:$|[?#])/i;

export function isImageUrl(url: string): boolean {
  return IMAGE_EXT_REGEX.test(url);
}

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_REGEX.test(url);
}

// Re-export from centralized URL utilities
export { isAbsoluteHttpUrl } from './utils/urlUtils';


