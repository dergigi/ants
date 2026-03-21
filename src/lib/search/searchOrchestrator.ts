import { NDKEvent } from '@nostr-dev-kit/ndk';
import { searchByNip19Identifier } from './idLookup';
import { getSearchRelaySet } from './relayManagement';
import { tryHandleUrlSearch } from './strategies/urlSearchStrategy';
import { tryHandleLicenseSearch } from './strategies/licenseSearchStrategy';
import { tryHandleHashtagSearch } from './strategies/hashtagSearchStrategy';
import { tryHandleATagSearch } from './strategies/aTagSearchStrategy';
import { tryHandleProfileSearch } from './strategies/profileSearchStrategy';
import { tryHandleIdentitySearch } from './strategies/identitySearchStrategy';
import { tryHandleAuthorSearch } from './strategies/authorSearchStrategy';
import { tryHandleMentionsSearch } from './strategies/mentionsSearchStrategy';
import { tryHandleReplySearch } from './strategies/replySearchStrategy';
import { tryHandleRefSearch } from './strategies/refSearchStrategy';
import { tryHandleLinkSearch } from './strategies/linkSearchStrategy';
import { tryHandleDTagSearch } from './strategies/dTagSearchStrategy';
import { SearchContext } from './types';

/**
 * Run search strategies in order and return the first non-null/non-empty result
 * Returns null if no strategy matches
 */
export async function runSearchStrategies(
  extCleanedQuery: string,
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { isStreaming, streamingOptions, chosenRelaySet, abortSignal, effectiveKinds, nip50Extensions, limit } = context;

  // URL search: strip protocol and search for domain/path content
  const urlResults = await tryHandleUrlSearch(
    cleanedQuery,
    effectiveKinds,
    nip50Extensions,
    limit,
    isStreaming || false,
    streamingOptions,
    chosenRelaySet,
    abortSignal
  );
  if (urlResults) return urlResults;

  // nevent/note/naddr bech32: fetch by NIP-19 identifier
  const nip19Results = await searchByNip19Identifier(extCleanedQuery, abortSignal, getSearchRelaySet);
  if (nip19Results.length > 0) return nip19Results;

  // Handle license:VALUE-only queries via direct tag subscription (#license)
  const licenseResults = await tryHandleLicenseSearch(cleanedQuery, context);
  if (licenseResults) return licenseResults;

  // Pure hashtag search: use tag-based filter across broad relay set (no NIP-50 required)
  const hashtagResults = await tryHandleHashtagSearch(cleanedQuery, context);
  if (hashtagResults) return hashtagResults;

  // Handle a: tag queries for replaceable events (e.g., a:30023:pubkey:d-tag)
  const aTagResults = await tryHandleATagSearch(cleanedQuery, context);
  if (aTagResults) return aTagResults;

  // Full-text profile search `p:<term>` (not only username)
  const profileResults = await tryHandleProfileSearch(cleanedQuery, context);
  if (profileResults) return profileResults;

  // Identity search (npub and NIP-05)
  const identityResults = await tryHandleIdentitySearch(cleanedQuery, context);
  if (identityResults) return identityResults;

  // Check for mentions filter (mentions:<user> → #p tag search)
  const mentionsResults = await tryHandleMentionsSearch(cleanedQuery, context);
  if (mentionsResults) return mentionsResults;

  // Check for reply filter (reply:<event-id> → #e tag search)
  const replyResults = await tryHandleReplySearch(cleanedQuery, context);
  if (replyResults) return replyResults;

  // Check for ref filter (ref:<naddr/coordinate> → #a tag search)
  const refResults = await tryHandleRefSearch(cleanedQuery, context);
  if (refResults) return refResults;

  // Check for link filter (link:<url> → #r tag search)
  const linkResults = await tryHandleLinkSearch(cleanedQuery, context);
  if (linkResults) return linkResults;

  // Check for d: filter (d:<identifier> → #d tag search)
  const dResults = await tryHandleDTagSearch(cleanedQuery, context);
  if (dResults) return dResults;

  // Check for author filter
  const authorResults = await tryHandleAuthorSearch(cleanedQuery, context);
  if (authorResults) return authorResults;

  return null;
}

