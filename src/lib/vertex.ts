// Re-export all profile-related functions from the new modular structure
// This maintains backward compatibility while using the refactored modules

export {
  resolveAuthor,
  resolveAuthorToNpub,
  resolveNip05ToPubkey,
  verifyNip05,
  checkNip05,
  invalidateNip05Cache,
  profileEventFromPubkey,
  subscribeAndCollectProfiles,
  getDirectFollows,
  countFollowerMentions,
  getOldestProfileMetadata,
  getNewestProfileMetadata,
  getNewestProfileEvent,
  extractProfileFields,
  computeMatchScore,
  queryVertexDVM,
  lookupVertexProfile,
  VERTEX_REGEXP,
  fallbackLookupProfile,
  searchProfilesFullText,
  getCachedDvm,
  setCachedDvm,
  getCachedNip05Result,
  setCachedNip05Result
} from './profile';
