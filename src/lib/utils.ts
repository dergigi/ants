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
