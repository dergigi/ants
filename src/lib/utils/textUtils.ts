/**
 * Text manipulation utilities for content processing
 */

/**
 * Normalizes whitespace while preserving newlines
 * Replaces multiple spaces/tabs with single space and trims
 */
export const normalizeWhitespace = (text: string): string => {
  return text.replace(/[ \t]{2,}/g, ' ').trim();
};

/**
 * Strips media URLs (images and videos) from text content
 * Removes various media file extensions and query parameters
 */
export const stripMediaUrls = (text: string): string => {
  if (!text) return '';
  const cleaned = text
    .replace(/(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg))(?:[?#][^\s]*)?/gi, '')
    .replace(/(https?:\/\/[^\s'"<>]+?\.(?:mp4|webm|ogg|ogv|mov|m4v))(?:[?#][^\s]*)?/gi, '')
    .replace(/\?[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '')
    .replace(/\?name=[^\s]*\.(?:png|jpe?g|gif|gifs|apng|webp|avif|svg|mp4|webm|ogg|ogv|mov|m4v)[^\s]*/gi, '');
  return normalizeWhitespace(cleaned);
};

/**
 * Strips preview URLs from text content
 * Removes URLs that have been successfully previewed
 */
export const stripPreviewUrls = (text: string, successfulPreviews: Set<string>): string => {
  if (!text) return '';
  let cleaned = text;
  successfulPreviews.forEach((url) => {
    if (!url) return;
    const trimmedUrl = url.replace(/[),.;]+$/, '');
    if (!trimmedUrl) return;
    const escapedUrl = trimmedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const regex = new RegExp(`${escapedUrl}[),.;]*`, 'gi');
      cleaned = cleaned.replace(regex, '');
    } catch (error) {
      cleaned = cleaned.split(trimmedUrl).join('');
      console.warn('Failed to strip preview URL', url, error);
    }
  });
  return normalizeWhitespace(cleaned);
};

/**
 * Strips both media URLs and preview URLs from text content
 * Convenience function that applies both stripping operations
 */
export const stripAllUrls = (text: string, successfulPreviews: Set<string>): string => {
  return stripPreviewUrls(stripMediaUrls(text), successfulPreviews);
};
