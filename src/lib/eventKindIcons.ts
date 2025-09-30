import { 
  faFeather, 
  faRetweet, 
  faHeart, 
  faImage, 
  faVideo, 
  faFile, 
  faCode, 
  faBug, 
  faExclamationTriangle, 
  faBolt, 
  faHighlighter, 
  faNewspaper, 
  faEyeSlash, 
  faThumbtack, 
  faBookmark 
} from '@fortawesome/free-solid-svg-icons';

/**
 * Maps Nostr event kinds to FontAwesome icons
 * Based on the mapping in public/kind-icons.txt
 */
export const EVENT_KIND_ICONS: Record<number, any> = {
  1: faFeather,        // Text notes
  6: faRetweet,        // Reposts
  7: faHeart,          // Reactions
  20: faImage,         // Image notes
  21: faVideo,         // Video notes
  22: faVideo,         // Video notes (alternative)
  1063: faFile,        // File attachments
  1617: faCode,        // Code snippets
  1621: faBug,         // Bug reports
  1984: faExclamationTriangle, // Reports
  9735: faBolt,        // Lightning payments
  9321: faBolt,        // Zap receipts (using bolt as fallback)
  9802: faHighlighter, // Highlights
  30023: faNewspaper,  // Articles
  10000: faEyeSlash,   // Mute lists
  10001: faThumbtack,  // Pin lists
  10003: faBookmark,   // Bookmark lists
};

/**
 * Get the FontAwesome icon for a given event kind
 * @param kind - The Nostr event kind number
 * @returns The FontAwesome icon or null if not found
 */
export function getEventKindIcon(kind: number): any {
  return EVENT_KIND_ICONS[kind] || null;
}

/**
 * Get the icon name for a given event kind (for display purposes)
 * @param kind - The Nostr event kind number
 * @returns The icon name string or null if not found
 */
export function getEventKindIconName(kind: number): string | null {
  const iconMap: Record<number, string> = {
    1: 'fa-feather',
    6: 'fa-retweet', 
    7: 'fa-heart',
    20: 'fa-image',
    21: 'fa-video',
    22: 'fa-video',
    1063: 'fa-file',
    1617: 'fa-code',
    1621: 'fa-bug',
    1984: 'fa-exclamation-triangle',
    9735: 'fa-bolt',
    9321: 'nutzap',
    9802: 'fa-highlighter',
    30023: 'fa-newspaper',
    10000: 'eye-slash',
    10001: 'fa-thumbtack',
    10003: 'fa-bookmark',
  };
  
  return iconMap[kind] || null;
}
