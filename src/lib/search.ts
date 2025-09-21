// Re-export all functions from modular components for backward compatibility
export { 
  searchEvents,
  searchEventsStreaming,
  sortEventsNewestFirst,
  isNpub,
  getPubkey,
  parseOrQuery,
  expandParenthesizedOr,
  extractNip50Extensions,
  buildSearchQueryWithExtensions,
  stripRelayFilters,
  extractKindFilter,
  subscribeAndStream,
  subscribeAndCollect,
  searchByAnyTerms
} from './search/core';

export { 
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  GIF_EXTENSIONS,
  type Nip50Extensions,
  type StreamingSearchOptions,
  type TagTFilter,
  type NDKEventWithRelaySource
} from './search/types';

export { 
  extractNip50Extensions as extractNip50ExtensionsFromNip50,
  buildSearchQueryWithExtensions as buildSearchQueryWithExtensionsFromNip50
} from './search/nip50';

export { 
  parseOrQuery as parseOrQueryFromParsing,
  expandParenthesizedOr as expandParenthesizedOrFromParsing,
  stripRelayFilters as stripRelayFiltersFromParsing,
  extractKindFilter as extractKindFilterFromParsing
} from './search/parsing';

export { 
  subscribeAndStream as subscribeAndStreamFromSubscription,
  subscribeAndCollect as subscribeAndCollectFromSubscription,
  searchByAnyTerms as searchByAnyTermsFromSubscription
} from './search/subscription';
