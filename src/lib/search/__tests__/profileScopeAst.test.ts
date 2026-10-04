import { ensureAuthorForBackend, toExplicitInputFromUrl, toImplicitUrlQuery } from '../queryTransforms';
import { addProfileScope, getProfileScopeIdentifiers, hasProfileScope, removeProfileScope, replaceProfileScopeIdentifier } from '../profileScope';
import { planQuery } from '../query/plan';

const npub = 'npub1current';
const scope = getProfileScopeIdentifiers(null, npub)!;
const authors = (query: string) => planQuery(query, [], [1]).branches.map(branch => branch.authors);

test('profile URLs scope every branch of an author-free expression', () => {
  for (const query of [ensureAuthorForBackend('bitcoin OR nostr', npub), toExplicitInputFromUrl('bitcoin OR nostr', npub)]) {
    expect(authors(query)).toEqual([[[npub]], [[npub]]]);
  }
});
test('sharing mixed authors preserves all explicit branch constraints', () => {
  const query = `bitcoin by:${npub} OR nostr by:alice`;
  expect(toImplicitUrlQuery(query, npub)).toBe(query);
  expect(authors(ensureAuthorForBackend(toImplicitUrlQuery(query, npub), npub))).toEqual([[[npub]], [['alice']]]);
  expect(toImplicitUrlQuery(`by:${npub}`, npub)).toBe('');
  expect(ensureAuthorForBackend('', npub)).toBe(`by:${npub}`);
});
test('quoted author text is literal and does not prevent profile scoping', () => {
  const query = `"by:${npub}" OR "from:alice"`;
  expect(hasProfileScope(query, scope)).toBe(false);
  expect(authors(ensureAuthorForBackend(query, npub))).toEqual([[[npub]], [[npub]]]);
  expect(replaceProfileScopeIdentifier(query, scope)).toBe(`(${query})`);
});
test('scope controls respect nested Boolean guarantees and from aliases', () => {
  expect(hasProfileScope(`a from:${npub} OR b`, scope)).toBe(false);
  expect(hasProfileScope(`(a OR b) from:${npub}`, scope)).toBe(true);
  expect(hasProfileScope(`by:${npub},alice`, scope)).toBe(false);
  expect(authors(addProfileScope('a OR (b AND c)', scope))).toEqual([[[npub]], [[npub]]]);
  expect(removeProfileScope(`a by:${npub} OR b from:${npub}`, scope)).toBe('(a OR b)');
  expect(removeProfileScope(`by:${npub} OR (a by:${npub})`, scope)).toBe('');
  expect(removeProfileScope(`a by:${npub} OR b`, scope)).toBe(`a by:${npub} OR b`);
});
test('incomplete editor input stays intact for parser diagnostics', () => {
  expect(ensureAuthorForBackend('(a OR)', npub)).toBe('(a OR)');
  expect(addProfileScope('(a OR)', scope)).toBe('(a OR)');
});
