// Centralized URL utilities (DRY approach)
// Consolidates all URL handling logic from across the codebase

/**
 * Extract domain name from URL for clean display, including first path segment
 * @param url - The URL to extract domain from
 * @returns The cleaned domain with first path (e.g., "x.com/reardencode" from "https://x.com/reardencode/status/1968650911787761977?s=46")
 */
export function extractDomainFromUrl(url: string): string {
  if (!url) return '';
  
  try {
    // Remove protocol (http://, https://)
    let cleaned = url.replace(/^https?:\/\//, '');
    
    // Remove www. prefix
    cleaned = cleaned.replace(/^www\./, '');
    
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
    // Remove protocol (http://, https://)
    let cleaned = url.replace(/^https?:\/\//, '');
    
    // Remove www. prefix
    cleaned = cleaned.replace(/^www\./, '');
    
    // Remove trailing slash
    cleaned = cleaned.replace(/\/$/, '');
    
    return cleaned;
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
    
    // Add domain
    shortened += urlObj.hostname.replace(/^www\./, '');
    
    // Add path if requested and it exists
    if (showPath && urlObj.pathname && urlObj.pathname !== '/') {
      const path = urlObj.pathname;
      // Take first path segment if it's not too long
      const pathSegments = path.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        const firstSegment = pathSegments[0];
        if (firstSegment.length <= 20) {
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
    const cleaned = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
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
 * Extract image URLs from text content
 * @param text - The text to search for image URLs
 * @returns Array of image URLs found
 */
export function extractImageUrls(text: string): string[] {
  if (!text) return [];
  
  const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
  const imageExtRegex = /\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg)(?:$|[?#])/i;
  
  const urls: string[] = [];
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[1];
    if (imageExtRegex.test(url)) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Extract video URLs from text content
 * @param text - The text to search for video URLs
 * @returns Array of video URLs found
 */
export function extractVideoUrls(text: string): string[] {
  if (!text) return [];
  
  const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
  const videoExtRegex = /\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:$|[?#])/i;
  
  const urls: string[] = [];
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[1];
    if (videoExtRegex.test(url)) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Extract non-media URLs from text content
 * @param text - The text to search for non-media URLs
 * @returns Array of non-media URLs found
 */
export function extractNonMediaUrls(text: string): string[] {
  if (!text) return [];
  
  const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
  const imageExtRegex = /\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg)(?:$|[?#])/i;
  const videoExtRegex = /\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:$|[?#])/i;
  
  const urls: string[] = [];
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[1];
    if (!imageExtRegex.test(url) && !videoExtRegex.test(url)) {
      urls.push(url);
    }
  }
  
  return urls;
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