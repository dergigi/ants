/**
 * Detects the type of search based on query patterns
 * Used to determine appropriate placeholder components
 */
export function detectSearchType(query: string): 'profile' | 'media' | 'text' | 'generic' {
  const trimmedQuery = query.trim().toLowerCase();
  
  // Check for profile searches (p: prefix)
  if (trimmedQuery.includes('p:') || trimmedQuery.includes('by:')) {
    return 'profile';
  }
  
  // Check for media searches
  const mediaPatterns = [
    'is:image', 'is:video', 'kind:1064', 'kind:1065', // NIP-94 media kinds
    'has:image', 'has:video', 'has:media',
    'image', 'video', 'photo', 'picture', 'gif', 'mp4', 'mov'
  ];
  
  for (const pattern of mediaPatterns) {
    if (trimmedQuery.includes(pattern)) {
      return 'media';
    }
  }
  
  // Check for text-focused searches
  const textPatterns = [
    'is:text', 'kind:1', 'kind:30023', // text notes and articles
    'text', 'note', 'post', 'article'
  ];
  
  for (const pattern of textPatterns) {
    if (trimmedQuery.includes(pattern)) {
      return 'text';
    }
  }
  
  // Default to generic for mixed or unknown queries
  return 'generic';
}
