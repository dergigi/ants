// UI Configuration Constants
export const UI_CONFIG = {
  // Text truncation settings
  TEXT_TRUNCATION: {
    // Maximum character length before showing "show more" button
    MAX_LENGTH: 500,
    
    // Alternative shorter length for inline content
    MAX_LENGTH_INLINE: 300,
    
    // Maximum length for profile descriptions
    MAX_LENGTH_PROFILE: 200
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
  }
} as const;

// Export individual constants for easier importing
export const TEXT_MAX_LENGTH = UI_CONFIG.TEXT_TRUNCATION.MAX_LENGTH;
export const TEXT_MAX_LENGTH_INLINE = UI_CONFIG.TEXT_TRUNCATION.MAX_LENGTH_INLINE;
export const TEXT_MAX_LENGTH_PROFILE = UI_CONFIG.TEXT_TRUNCATION.MAX_LENGTH_PROFILE;
