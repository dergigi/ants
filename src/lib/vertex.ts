// Re-export all functions from modular components for backward compatibility
export { 
  resolveNip05ToPubkey,
  profileEventFromPubkey,
  resolveAuthor,
  resolveAuthorToNpub,
  getOldestProfileMetadata,
  getNewestProfileMetadata,
  getNewestProfileEvent,
  searchProfilesFullText,
  checkNip05,
  invalidateNip05Cache,
  VERTEX_REGEXP
} from './profile/resolution';

// Re-export DVM functions
export { queryVertexDVM } from './dvm/query';
export { getCachedDvm, setCachedDvm } from './dvm/cache';
