import { 
  faFeather, 
  faRetweet, 
  faHeart, 
  faImage, 
  faVideo, 
  faFile, 
  faCode, 
  faLaptopCode,
  faBug, 
  faExclamationTriangle, 
  faBolt, 
  faHighlighter, 
  faNewspaper, 
  faEyeSlash, 
  faThumbtack, 
  faBookmark,
  faCircleUser,
  faUsers,
  type IconDefinition
} from '@fortawesome/free-solid-svg-icons';

/**
 * Maps Nostr event kinds to FontAwesome icons
 * Based on the mapping in public/kind-icons.txt
 */
export const EVENT_KIND_ICONS: Record<number, IconDefinition> = {
  0: faCircleUser,     // Profile metadata
  1: faFeather,        // Text notes
  6: faRetweet,        // Reposts
  7: faHeart,          // Reactions
  20: faImage,         // Image notes
  21: faVideo,         // Video notes
  22: faVideo,         // Video notes (alternative)
  1063: faFile,        // File attachments
  1617: faCode,        // Code snippets
  1337: faLaptopCode,  // Code snippets (1337)
  1621: faBug,         // Bug reports
  1984: faExclamationTriangle, // Reports
  9735: faBolt,        // Lightning payments
  9321: faBolt,        // Zap receipts (using bolt as fallback)
  9802: faHighlighter, // Highlights
  30023: faNewspaper,  // Articles
  10000: faEyeSlash,   // Mute lists
  10001: faThumbtack,  // Pin lists
  10003: faBookmark,   // Bookmark lists
  39089: faUsers,      // Follow packs
};

/**
 * Get the FontAwesome icon for a given event kind
 * @param kind - The Nostr event kind number
 * @returns The FontAwesome icon or null if not found
 */
export function getEventKindIcon(kind: number): IconDefinition | null {
  return EVENT_KIND_ICONS[kind] || null;
}

/**
 * Get the icon name for a given event kind (for display purposes)
 * @param kind - The Nostr event kind number
 * @returns The icon name string or null if not found
 */
export function getEventKindIconName(kind: number): string | null {
  const iconMap: Record<number, string> = {
    0: 'fa-circle-user',
    1: 'fa-feather',
    6: 'fa-retweet', 
    7: 'fa-heart',
    20: 'fa-image',
    21: 'fa-video',
    22: 'fa-video',
    1063: 'fa-file',
    1617: 'fa-code',
    1337: 'fa-laptop-code',
    1621: 'fa-bug',
    1984: 'fa-exclamation-triangle',
    9735: 'fa-bolt',
    9321: 'nutzap',
    9802: 'fa-highlighter',
    30023: 'fa-newspaper',
    10000: 'eye-slash',
    10001: 'fa-thumbtack',
    10003: 'fa-bookmark',
    39089: 'fa-users',
  };
  
  return iconMap[kind] || null;
}

/**
 * Get the display name for a given event kind
 * @param kind - The Nostr event kind number
 * @returns The display name string or "Note" as fallback
 */
export function getEventKindDisplayName(kind: number): string {
  const displayNames: Record<number, string> = {
    0: 'Profile',
    1: 'Note',
    6: 'Repost',
    7: 'Reaction',
    20: 'Image',
    21: 'Video',
    22: 'Video',
    1063: 'File',
    1617: 'Code',
    1337: 'Code',
    1621: 'Issue',
    1984: 'Report',
    9735: 'Zap',
    9321: 'Nutzap',
    9802: 'Highlight',
    30023: 'Article',
    10000: 'Mute List',
    10001: 'Pin List',
    10003: 'Bookmark List',
    39089: 'Follow Pack',
  };
  
  return displayNames[kind] || 'Note';
}
