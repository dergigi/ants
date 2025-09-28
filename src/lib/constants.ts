// UI Configuration Constants
export const UI_CONFIG = {
  // Text truncation settings
  TEXT_TRUNCATION: {
    // Maximum character length before showing "show more" button
    MAX_LENGTH: 500,
    
    // Alternative shorter length for inline content
    MAX_LENGTH_INLINE: 300,
    
    // Maximum length for profile descriptions
    MAX_LENGTH_PROFILE: 200,
    
    // Character count for links in truncation calculation
    LINK_CHAR_COUNT: 10
  },
  
  // Search result settings
  SEARCH_RESULTS: {
    // Maximum number of results to show initially
    MAX_INITIAL_RESULTS: 50,
    
    // Number of results to load per page
    RESULTS_PER_PAGE: 20
  },
  
  // Media settings
  MEDIA: {
    // Maximum image dimensions
    MAX_IMAGE_WIDTH: 800,
    MAX_IMAGE_HEIGHT: 600,
    
    // Maximum video duration in seconds
    MAX_VIDEO_DURATION: 300
  },
  
  // Search & Results settings
  SEARCH: {
    // Maximum number of results to return
    MAX_RESULTS: 1000,
    
    // Maximum results for streaming queries
    MAX_RESULTS_STREAMING: 200,
    
    // Default search timeout in milliseconds
    DEFAULT_TIMEOUT: 30000,
    
    // Timeout for hinted relay queries
    HINTED_TIMEOUT: 5000,
    
    // Timeout for fallback relay queries
    FALLBACK_TIMEOUT: 8000,
    
    // NIP-05 resolution timeout
    NIP05_TIMEOUT: 4000,
    
    // Minimum number of results to show filter controls
    FILTER_THRESHOLD: 69
  },
  
  // Profile search settings
  PROFILE: {
    // Maximum number of profiles to return for profile-specific searches
    SEARCH_MAX_RESULTS: 21
  },
  
  // Content filtering settings
  FILTERS: {
    // Keywords that indicate bridged content (case-insensitive)
    BRIDGED_KEYWORDS: [
      'mostr.pub',
      'mastodon',
      'bluesky',
      'bsky.app',
      'bsky.social'
    ]
  }
} as const;

// Export individual constants for easier importing
export const TEXT_MAX_LENGTH = UI_CONFIG.TEXT_TRUNCATION.MAX_LENGTH;
export const TEXT_MAX_LENGTH_INLINE = UI_CONFIG.TEXT_TRUNCATION.MAX_LENGTH_INLINE;
export const TEXT_MAX_LENGTH_PROFILE = UI_CONFIG.TEXT_TRUNCATION.MAX_LENGTH_PROFILE;
export const TEXT_LINK_CHAR_COUNT = UI_CONFIG.TEXT_TRUNCATION.LINK_CHAR_COUNT;

// Search constants
export const SEARCH_MAX_RESULTS = UI_CONFIG.SEARCH.MAX_RESULTS;
export const SEARCH_MAX_RESULTS_STREAMING = UI_CONFIG.SEARCH.MAX_RESULTS_STREAMING;
export const SEARCH_DEFAULT_TIMEOUT = UI_CONFIG.SEARCH.DEFAULT_TIMEOUT;
export const SEARCH_HINTED_TIMEOUT = UI_CONFIG.SEARCH.HINTED_TIMEOUT;
export const SEARCH_FALLBACK_TIMEOUT = UI_CONFIG.SEARCH.FALLBACK_TIMEOUT;
export const SEARCH_NIP05_TIMEOUT = UI_CONFIG.SEARCH.NIP05_TIMEOUT;
export const SEARCH_FILTER_THRESHOLD = UI_CONFIG.SEARCH.FILTER_THRESHOLD;

// Profile constants
export const PROFILE_SEARCH_MAX_RESULTS = UI_CONFIG.PROFILE.SEARCH_MAX_RESULTS;

// Filter constants
export const BRIDGED_KEYWORDS = UI_CONFIG.FILTERS.BRIDGED_KEYWORDS;
