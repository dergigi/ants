import { isMobileViewport } from '@/lib/utils/ssr';

// Centralized URL utilities (DRY approach)
// Consolidates all URL handling logic from across the codebase

/**
 * Base URL cleaning function - removes protocol and www prefix
 * @param url - The URL to clean
 * @returns The cleaned URL without protocol and www
 */
function cleanUrlBase(url: string): string {
  if (!url) return '';
  
  try {
    // Remove protocol (http://, https://)
    let cleaned = url.replace(/^https?:\/\//, '');
    
    // Remove www. prefix
    cleaned = cleaned.replace(/^www\./, '');
    
    return cleaned;
  } catch {
    return url;
  }
}

/**
 * Extract domain name from URL for clean display, including first path segment
 * @param url - The URL to extract domain from
 * @returns The cleaned domain with first path (e.g., "x.com/reardencode" from "https://x.com/reardencode/status/1968650911787761977?s=46")
 */
export function extractDomainFromUrl(url: string): string {
  if (!url) return '';
  
  try {
    const cleaned = cleanUrlBase(url);
    
    // Split by '/' and take domain + first path segment (if exists)
    const parts = cleaned.split('/');
    const domain = parts[0];
    const firstPath = parts[1];
    
    // Return domain with first path if it exists and is not empty
    if (firstPath && firstPath.trim() && !firstPath.includes('?')) {
      return `${domain}/${firstPath}`;
    }
    
    return domain;
  } catch {
    return url;
  }
}

/**
 * Clean website URL by removing protocol and www prefix
 * @param url - The URL to clean
 * @returns The cleaned URL without protocol and www
 */
export function cleanWebsiteUrl(url: string): string {
  if (!url) return '';
  
  try {
    const cleaned = cleanUrlBase(url);
    
    // Remove trailing slash
    return cleaned.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * Shorten URL for display purposes with configurable options
 * @param url - The URL to shorten
 * @param options - Shortening options
 * @returns The shortened URL
 */
export function shortenUrl(url: string, options: {
  maxLength?: number;
  showProtocol?: boolean;
  showPath?: boolean;
  ellipsis?: string;
} = {}): string {
  if (!url) return '';
  
  const {
    maxLength = 50,
    showProtocol = false,
    showPath = true,
    ellipsis = '...'
  } = options;
  
  try {
    const urlObj = new URL(url);
    let shortened = '';
    
    // Build the shortened URL
    if (showProtocol) {
      shortened += urlObj.protocol + '//';
    }
    
    // Use base cleaning for domain
    shortened += cleanUrlBase(urlObj.toString());
    
    // Add path if requested and it exists
    if (showPath && urlObj.pathname && urlObj.pathname !== '/') {
      const path = urlObj.pathname;
      // Take first path segment if it's not too long
      const pathSegments = path.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        const firstSegment = pathSegments[0];
        // For very short maxLength, be more aggressive with path segment length
        const maxSegmentLength = maxLength <= 30 ? 10 : 20;
        if (firstSegment.length <= maxSegmentLength) {
          shortened += `/${firstSegment}`;
        }
      }
    }
    
    // Truncate if too long
    if (shortened.length > maxLength) {
      shortened = shortened.substring(0, maxLength - ellipsis.length) + ellipsis;
    }
    
    return shortened;
  } catch {
    // Fallback to simple truncation if URL parsing fails
    const cleaned = cleanUrlBase(url);
    if (cleaned.length > maxLength) {
      return cleaned.substring(0, maxLength - ellipsis.length) + ellipsis;
    }
    return cleaned;
  }
}

/**
 * Get a display-friendly version of a URL with smart shortening
 * @param url - The URL to format
 * @param maxLength - Maximum length for the display text
 * @returns Object with display text and full URL
 */
export function formatUrlForDisplay(url: string, maxLength: number = 40): {
  displayText: string;
  fullUrl: string;
  isShortened: boolean;
} {
  if (!url) return { displayText: '', fullUrl: '', isShortened: false };
  
  const fullUrl = url;
  const shortened = shortenUrl(url, { maxLength, showProtocol: false, showPath: true });
  const isShortened = shortened.length < url.length;
  
  return {
    displayText: shortened,
    fullUrl,
    isShortened
  };
}

/**
 * Get responsive URL display text based on viewport width
 * @param url - The URL to format
 * @param options - Optional configuration for desktop and mobile max lengths
 * @returns Display text tailored for desktop and mobile along with metadata
 */
export function formatUrlResponsive(
  url: string,
  options: {
    desktopMaxLength?: number;
    mobileMaxLength?: number;
    breakpoint?: number;
  } = {}
): {
  displayText: string;
  fullUrl: string;
  isShortened: boolean;
} {
  const {
    desktopMaxLength = 40,
    mobileMaxLength = 28,
    breakpoint = 768
  } = options;

  if (!url) {
    return { displayText: '', fullUrl: '', isShortened: false };
  }

  const fullUrl = url;
  const isMobile = isMobileViewport(breakpoint);
  const maxLength = isMobile ? mobileMaxLength : desktopMaxLength;
  const shortened = shortenUrl(url, { maxLength, showProtocol: false, showPath: true });
  const isShortened = shortened.length < url.length;

  return {
    displayText: shortened,
    fullUrl,
    isShortened
  };
}

/**
 * Check if a string is a valid HTTP/HTTPS URL
 * @param value - The value to check
 * @returns True if it's a valid HTTP/HTTPS URL
 */
export function isAbsoluteHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Clean and normalize a URL for consistent handling
 * @param url - The URL to normalize
 * @returns The normalized URL
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    // Remove trailing slash from pathname
    if (urlObj.pathname.endsWith('/') && urlObj.pathname !== '/') {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Base function to extract URLs from text with optional filtering
 * @param text - The text to search for URLs
 * @param filterFn - Optional function to filter URLs
 * @returns Array of URLs found
 */
function extractUrlsBase(text: string, filterFn?: (url: string) => boolean): string[] {
  if (!text) return [];
  
  const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
  const urls: string[] = [];
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[1];
    if (!filterFn || filterFn(url)) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Extract image URLs from text content
 * @param text - The text to search for image URLs
 * @returns Array of image URLs found
 */
export function extractImageUrls(text: string): string[] {
  const imageExtRegex = /\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg)(?:$|[?#])/i;
  return extractUrlsBase(text, (url) => imageExtRegex.test(url));
}

/**
 * Extract video URLs from text content
 * @param text - The text to search for video URLs
 * @returns Array of video URLs found
 */
export function extractVideoUrls(text: string): string[] {
  const videoExtRegex = /\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:$|[?#])/i;
  return extractUrlsBase(text, (url) => videoExtRegex.test(url));
}

/**
 * Extract non-media URLs from text content
 * @param text - The text to search for non-media URLs
 * @returns Array of non-media URLs found
 */
export function extractNonMediaUrls(text: string): string[] {
  const imageExtRegex = /\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg)(?:$|[?#])/i;
  const videoExtRegex = /\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:$|[?#])/i;
  return extractUrlsBase(text, (url) => !imageExtRegex.test(url) && !videoExtRegex.test(url));
}

/**
 * Extract filename from URL
 * @param url - The URL to extract filename from
 * @returns The filename or empty string if not found
 */
export function getFilenameFromUrl(url: string): string {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    return filename || '';
  } catch {
    return '';
  }
}