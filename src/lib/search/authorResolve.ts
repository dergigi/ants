import { nip19 } from 'nostr-tools';
import { resolveAuthor } from '../vertex';

/**
 * Resolve an array of author tokens (npubs or usernames) to hex pubkeys in parallel.
 * Invalid or unresolvable tokens are silently dropped with a warning.
 */
export async function resolveAuthorTokens(tokens: string[]): Promise<string[]> {
  const results = await Promise.all(
    tokens.map(async (authorToken) => {
      try {
        if (/^npub1[0-9a-z]+$/i.test(authorToken)) {
          return nip19.decode(authorToken).data as string;
        }
        const resolved = await resolveAuthor(authorToken);
        return resolved.pubkeyHex || null;
      } catch (error) {
        console.warn(`Failed to resolve author ${authorToken}:`, error);
        return null;
      }
    })
  );
  return results.filter((pk): pk is string => pk !== null);
}
