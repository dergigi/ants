/**
 * Utility functions for Server-Side Rendering (SSR) compatibility
 */

/**
 * Checks if code is running in a browser environment
 * @returns true if running in browser, false if in SSR
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Safely executes a function only in browser environment
 * @param fn - Function to execute
 * @param fallback - Value to return if not in browser
 * @returns Result of function or fallback
 */
export function safeBrowserExecute<T>(fn: () => T, fallback: T): T {
  return isBrowser() ? fn() : fallback;
}

/**
 * Gets window object safely
 * @returns Window object or undefined
 */
export function getWindow(): Window | undefined {
  return isBrowser() ? window : undefined;
}
