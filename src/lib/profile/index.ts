// Profile lookup and resolution exports
export { resolveAuthor, resolveAuthorToNpub } from './resolver';
export { resolveNip05ToPubkey, verifyNip05, checkNip05, invalidateNip05CacheEntry } from './nip05';
export { 
  profileEventFromPubkey, 
  subscribeAndCollectProfiles, 
  getDirectFollows, 
  countFollowerMentions,
  getOldestProfileMetadata,
  getNewestProfileMetadata,
  getNewestProfileEvent,
  extractProfileFields,
  computeMatchScore
} from './utils';
export { queryVertexDVM, VERTEX_REGEXP } from './dvm-core';
export { lookupVertexProfile } from './dvm-lookup';
export { fallbackLookupProfile } from './fallback';
export { searchProfilesFullText } from './search';
export { 
  getCachedDvm, 
  setCachedDvm, 
  getCachedNip05Result, 
  setCachedNip05Result, 
  invalidateNip05Cache 
} from './cache';
