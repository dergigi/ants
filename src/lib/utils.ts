/**
 * Shortens a long string by keeping the beginning and end, removing the middle part
 * @param str - The string to shorten
 * @param startLength - Number of characters to keep at the start (default: 8)
 * @param endLength - Number of characters to keep at the end (default: 4)
 * @param separator - The separator to use between start and end (default: '…')
 * @returns The shortened string
 */
export function shortenString(
  str: string, 
  startLength: number = 8, 
  endLength: number = 4, 
  separator: string = '…'
): string {
  if (!str || str.length <= startLength + endLength) {
    return str;
  }
  
  const start = str.slice(0, startLength);
  const end = str.slice(-endLength);
  return `${start}${separator}${end}`;
}

// Re-export URL utilities from centralized module
export { extractDomainFromUrl } from './utils/urlUtils';

/**
 * Shortens an npub string using the standard format
 * @param npub - The npub string to shorten
 * @returns The shortened npub string
 */
export function shortenNpub(npub: string): string {
  return shortenString(npub, 10, 3);
}

/**
 * Shortens an nevent string using the standard format
 * @param nevent - The nevent string to shorten
 * @returns The shortened nevent string
 */
export function shortenNevent(nevent: string): string {
  return shortenString(nevent, 10, 3);
}

/**
 * Calculates smart menu positioning to ensure the menu stays within viewport
 * @param buttonRect - The bounding rectangle of the button that triggered the menu
 * @param menuWidth - The width of the menu (default: 224px for w-56)
 * @param menuHeight - The height of the menu (default: auto)
 * @returns Object with top and left positioning values
 */
export function calculateMenuPosition(
  buttonRect: DOMRect, 
  menuWidth: number = 224, 
  menuHeight: number = 200
): { top: number; left: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Calculate initial position (below and aligned with left edge of button)
  let left = buttonRect.left;
  let top = buttonRect.bottom + 4;
  
  // Adjust horizontal position if menu would go off-screen
  if (left + menuWidth > viewportWidth) {
    // Try positioning from the right edge of the button
    left = buttonRect.right - menuWidth;
    
    // If still off-screen, position from the right edge of viewport
    if (left < 0) {
      left = viewportWidth - menuWidth - 8; // 8px margin from edge
    }
  }
  
  // Adjust vertical position if menu would go off-screen
  if (top + menuHeight > viewportHeight) {
    // Position above the button instead
    top = buttonRect.top - menuHeight - 4;
    
    // If still off-screen, position at the top of viewport
    if (top < 0) {
      top = 8; // 8px margin from top
    }
  }
  
  return { top, left };
}

/**
 * Calculates smart menu positioning for absolute positioning (relative to document)
 * @param buttonRect - The bounding rectangle of the button that triggered the menu
 * @param menuWidth - The width of the menu (default: 224px for w-56)
 * @param menuHeight - The height of the menu (default: auto)
 * @returns Object with top and left positioning values
 */
export function calculateAbsoluteMenuPosition(
  buttonRect: DOMRect, 
  menuWidth: number = 224, 
  menuHeight: number = 200
): { top: number; left: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  
  // Calculate initial position (below and aligned with left edge of button)
  let left = buttonRect.left + scrollX;
  let top = buttonRect.bottom + scrollY + 4;
  
  // Adjust horizontal position if menu would go off-screen
  if (left + menuWidth > viewportWidth + scrollX) {
    // Try positioning from the right edge of the button
    left = buttonRect.right + scrollX - menuWidth;
    
    // If still off-screen, position from the right edge of viewport
    if (left < scrollX) {
      left = viewportWidth + scrollX - menuWidth - 8; // 8px margin from edge
    }
  }
  
  // Adjust vertical position if menu would go off-screen
  if (top + menuHeight > viewportHeight + scrollY) {
    // Position above the button instead
    top = buttonRect.top + scrollY - menuHeight - 4;
    
    // If still off-screen, position at the top of viewport
    if (top < scrollY) {
      top = scrollY + 8; // 8px margin from top
    }
  }
  
  return { top, left };
}

/**
 * Calculates positioning for banner menu (positioned relative to viewport, not document)
 * @param buttonRect - The bounding rectangle of the button that triggered the menu
 * @param menuWidth - The width of the menu (default: 224px for w-56)
 * @param menuHeight - The height of the menu (default: auto)
 * @returns Object with top and left positioning values
 */
export function calculateBannerMenuPosition(
  buttonRect: DOMRect, 
  menuWidth: number = 224, 
  menuHeight: number = 200
): { top: number; left: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Calculate initial position (below and aligned with left edge of button)
  let left = buttonRect.left;
  let top = buttonRect.bottom + 4;
  
  // Adjust horizontal position if menu would go off-screen
  if (left + menuWidth > viewportWidth) {
    // Try positioning from the right edge of the button
    left = buttonRect.right - menuWidth;
    
    // If still off-screen, position from the right edge of viewport
    if (left < 0) {
      left = viewportWidth - menuWidth - 8; // 8px margin from edge
    }
  }
  
  // Adjust vertical position if menu would go off-screen
  if (top + menuHeight > viewportHeight) {
    // Position above the button instead
    top = buttonRect.top - menuHeight - 4;
    
    // If still off-screen, position at the top of viewport
    if (top < 0) {
      top = 8; // 8px margin from top
    }
  }
  
  return { top, left };
}

/**
 * Cleans up NIP-05 display by removing implicit prefixes
 * @param nip05 - The NIP-05 string to clean
 * @returns The cleaned NIP-05 string without implicit prefixes
 */
export function cleanNip05Display(nip05?: string | null): string {
  if (typeof nip05 !== 'string') return '';

  const normalized = nip05.trim();
  if (!normalized) return '';

  // Remove "_@" prefix if present (implicit in NIP-05)
  return normalized.replace(/^_@/, '');
}

/**
 * Trims whitespace from URLs to prevent Next.js Image component errors
 * @param url - The URL string to clean
 * @returns The trimmed URL string
 */
export function trimImageUrl(url?: string | null): string {
  if (typeof url !== 'string') return '';
  return url.trim();
}

/**
 * Safely decodes a URI component, returning the original string if decoding fails
 * @param s - The string to decode
 * @returns The decoded string or the original string if decoding fails
 */
export function decodeMaybe(s: string): string {
  try { 
    return decodeURIComponent(s); 
  } catch { 
    return s; 
  }
}

/**
 * Normalizes a query by removing OR operators and splitting into terms
 * @param query - The search query to normalize
 * @returns Array of normalized terms
 */
function normalizeQueryTerms(query: string): string[] {
  if (!query.trim()) return [];
  return query.replace(/\s+OR\s+/gi, ' ').trim().split(/\s+/);
}

/**
 * Checks if a query contains only hashtags (with OR operators)
 * @param query - The search query to check
 * @returns true if the query contains only hashtags
 */
export function isHashtagOnlyQuery(query: string): boolean {
  const terms = normalizeQueryTerms(query);
  return terms.length > 0 && terms.every(term => term.startsWith('#'));
}

/**
 * Converts a hashtag query to URL-friendly format for /t/ path
 * @param query - The hashtag query (e.g., "#pugstr OR #dogstr OR #goatstr")
 * @returns URL-friendly hashtag string (e.g., "pugstr,dogstr,goatstr")
 */
export function hashtagQueryToUrl(query: string): string {
  if (!isHashtagOnlyQuery(query)) return '';
  
  const terms = normalizeQueryTerms(query);
  
  // Remove # prefix and join with commas
  return terms
    .map(term => term.startsWith('#') ? term.slice(1) : term)
    .join(',');
}

/**
 * Processes hashtag input and converts to search query format
 * @param hashtags - Raw hashtag input (e.g., "pugstr,dogstr,goatstr")
 * @returns Normalized search query (e.g., "#pugstr OR #dogstr OR #goatstr")
 */
export function processHashtagInput(hashtags: string): string {
  if (!hashtags.trim()) return '';
  
  // Split by comma, space, or plus sign to handle multiple hashtags
  const hashtagList = hashtags
    .split(/[,+\s]+/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
    .map(tag => {
      // Ensure hashtag starts with # if not already present
      return tag.startsWith('#') ? tag : `#${tag}`;
    });
  
  if (hashtagList.length === 0) return '';
  
  // If multiple hashtags, join with OR operator
  if (hashtagList.length === 1) {
    return hashtagList[0];
  } else {
    return hashtagList.join(' OR ');
  }
}