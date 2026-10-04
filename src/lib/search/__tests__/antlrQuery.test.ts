import fs from 'node:fs';
import path from 'node:path';
import fixtures from '../../../../grammar/fixtures/queries.json';
import { parseQuery } from '../query/parse';
import { planQuery } from '../query/plan';
import { printQuery, QueryError } from '../query/ast';
import { searchExamples } from '../../examples';

const rules = fs.readFileSync(path.join(process.cwd(), 'public/replacements.txt'), 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^([a-z]+):([^ ]+)\s*=>\s*(.+)$/);
  return m ? [{ kind: m[1], key: m[2], expansion: m[3] }] : [];
});
const plan = (q: string) => planQuery(q, rules, fixtures.defaultKinds, new Date(fixtures.now));

describe('shared ANTLR query contract', () => {
  for (const fixture of fixtures.valid) test(fixture.query, () => {
    const result = plan(fixture.query);
    if (fixture.searches) expect(result.branches.map(b => b.filter.search)).toEqual(fixture.searches);
    if (fixture.filters) expect(result.branches.map(b => b.filter)).toEqual(fixture.filters);
    if (fixture.authors) expect(result.branches.map(b => b.authors)).toEqual(fixture.authors);
    if (fixture.profiles) expect(result.branches.map(b => b.profile)).toEqual(fixture.profiles);
    expect(plan(printQuery(result.tree)).branches).toEqual(result.branches);
  });
  for (const query of fixtures.invalid) test(`rejects ${JSON.stringify(query)}`, () => expect(() => plan(query)).toThrow(QueryError));
  test('limits depth and branch products before allocation', () => {
    expect(() => plan('('.repeat(17) + 'a' + ')'.repeat(17))).toThrow('nested');
    expect(() => plan(Array.from({ length: 12 }, (_, i) => `(a${i} OR b${i})`).join(' '))).toThrow('32 branches');
    expect(() => plan('a'.repeat(2001))).toThrow('2000 characters');
  });
  test('aliases expand structurally and protect quoted literals', () => {
    expect(plan('(GM OR GN) has:image').branches).toHaveLength(12);
    expect(plan('"has:image"').branches[0].filter.search).toBe('"has:image"');
    expect(plan('is:video').branches[0].filter.kinds).toEqual([21, 22]);
  });
  test('source spans use UTF-16 offsets, including after emoji', () => {
    const tree = parseQuery('👀 kind:1');
    expect(tree.type).toBe('and');
    if (tree.type === 'and') expect(tree.children[1].span).toEqual({ start: 3, end: 9 });
  });
  test.each(searchExamples.filter(q => !q.startsWith('/')))('published example compiles: %s', query => {
    expect(plan(query).branches.length).toBeGreaterThan(0);
  });
});

describe('author preview', () => {
  test('resolves scoped authors once and never resolves quoted text', async () => {
    const { resolvePreviewAuthors } = await import('../query/preview');
    const { nip19 } = await import('nostr-tools');
    const alice = 'a'.repeat(64), bob = 'b'.repeat(64);
    const resolver = jest.fn(async (name: string) => [name === 'alice' ? alice : bob]);
    const result = await resolvePreviewAuthors(plan('by:(alice OR bob) (hello OR "by:alice") mentions:alice').leaves, resolver);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(result[0][0].value).toBe(`${nip19.npubEncode(alice)},${nip19.npubEncode(bob)}`);
    expect(result[1][1]).toMatchObject({ type: 'phrase', value: 'by:alice' });
    expect(result[0][2].value).toBe(nip19.npubEncode(alice));
  });
});

test('profile navigation removes only structured authors and preserves group meaning', async () => {
  const { withoutAuthorFields } = await import('../query/plan');
  const stripped = withoutAuthorFields(plan('(a OR b) by:alice "by:alice"').tree)!;
  expect(plan(printQuery(stripped)).branches.map(b => b.filter.search)).toEqual(['a "by:alice"', 'b "by:alice"']);
  expect(withoutAuthorFields(plan('by:alice OR (by:alice kind:1)').tree)).toBeUndefined();
});
