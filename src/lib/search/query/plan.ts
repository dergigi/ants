import { QueryError, QueryNode, Leaf, QUERY_LIMITS, printQuery } from './ast';
import { parseQuery } from './parse';
import { parseDateValue } from '../relativeDates';

export interface AliasRule { kind: string; key: string; expansion: string }
export interface BranchPlan {
  filter: { kinds?: number[]; authors?: string[]; ids?: string[]; since?: number; until?: number; search?: string; [key: `#${string}`]: string[] };
  authors: string[][];
  mentions: string[][];
  profile?: string;
}
const fields = new Set(['by', 'from', 'mentions', 'kind', 'since', 'until', 'p', 'site', 'a', 'license', 'domain', 'language', 'sentiment', 'nsfw', 'include']);
function at(node: QueryNode, message: string): never { throw new QueryError(message, node.span); }

export function expandAliases(tree: QueryNode, rules: AliasRule[], depth = 0): QueryNode {
  if (depth > 8) return at(tree, 'Alias expansion is recursive');
  if (tree.type === 'and' || tree.type === 'or') return { ...tree, children: tree.children.map(n => expandAliases(n, rules, depth)) };
  if (tree.type !== 'field') return tree;
  if (['http', 'https', 'ftp'].includes(tree.name)) return { type: 'text', value: tree.value.replace(/^\/\/(www\.)?/, ''), span: tree.span };
  if (tree.name === 'nostr') return { type: 'text', value: tree.value, span: tree.span };
  const rule = rules.find(r => r.kind === tree.name && r.key.toLowerCase() === tree.value.toLowerCase());
  if (rule && rule.key) {
    const remap = (n: QueryNode): QueryNode => n.type === 'and' || n.type === 'or'
      ? { ...n, span: tree.span, children: n.children.map(remap) } : { ...n, span: tree.span };
    return expandAliases(remap(parseQuery(rule.expansion)), rules, depth + 1);
  }
  if (tree.name === 'site') return { type: 'text', value: tree.value, span: tree.span };
  if (!fields.has(tree.name)) return at(tree, `Unknown modifier '${tree.name}:'. Quote it to search literally`);
  return tree;
}

// Coalesce only an OR of values for ONE native list field. Never flatten
// correlated branches such as (by:a kind:1) OR (by:b kind:2).
export function compactLists(node: QueryNode): QueryNode {
  if (node.type !== 'and' && node.type !== 'or') return node;
  const children = node.children.map(compactLists);
  const first = children[0];
  if (node.type === 'or' && first.type === 'field' && ['kind', 'by', 'from', 'mentions'].includes(first.name) &&
      children.every(n => n.type === 'field' && n.name === first.name && !n.quoted)) {
    return { ...first, value: children.map(n => (n as Extract<Leaf, { type: 'field' }>).value).join(','), span: node.span };
  }
  return { ...node, children };
}
export function branchLeaves(node: QueryNode): Leaf[][] {
  function cost(n: QueryNode): number {
    if (n.type !== 'and' && n.type !== 'or') return 1;
    let total = n.type === 'or' ? 0 : 1;
    for (const child of n.children) {
      const c = cost(child);
      total = n.type === 'or' ? total + c : total * c;
      if (total > QUERY_LIMITS.branches) return at(n, `Search expands to more than ${QUERY_LIMITS.branches} branches. Narrow the groups`);
    }
    return total;
  }
  cost(node); // Check before allocating the Cartesian product.
  function expand(n: QueryNode): Leaf[][] {
    if (n.type === 'or') return n.children.flatMap(expand);
    if (n.type === 'and') return n.children.reduce<Leaf[][]>((acc, c) => acc.flatMap(a => expand(c).map(b => [...a, ...b])), [[]]);
    return [[n]];
  }
  const unique = new Map<string, Leaf[]>();
  for (const leaves of expand(node)) unique.set(leaves.map(printQuery).join(' '), leaves);
  return [...unique.values()];
}
function list(value: string, node: QueryNode): string[] {
  const parts = value.split(',');
  if (parts.some(p => !p.trim())) return at(node, 'List values cannot be empty');
  return [...new Set(parts.map(p => p.trim()))];
}
export function compileBranch(leaves: Leaf[], defaultKinds: number[], now: Date, exact = false): BranchPlan {
  const plan: BranchPlan = { filter: {}, authors: [], mentions: [] };
  const text: string[] = [];
  const extensions = new Map<string, string>();
  function intersect<T>(old: T[] | undefined, next: T[], node: QueryNode): T[] {
    const result = old ? old.filter(x => next.includes(x)) : next;
    if (!result.length) return at(node, 'Contradictory filters in the same branch. Use OR for alternatives');
    return result;
  }
  for (const n of leaves) {
    if (n.type !== 'field') {
      if (n.type === 'text' && n.value.startsWith('#') && n.value.length > 1) {
        const tag = n.value.slice(1).toLowerCase();
        // Two different required tags cannot be represented by one #t OR list.
        if (plan.filter['#t'] && !plan.filter['#t'].includes(tag)) return at(n, 'Use OR between hashtags, or search one hashtag at a time');
        plan.filter['#t'] = [tag];
      } else text.push(n.type === 'phrase' && !exact ? JSON.stringify(n.value) : n.value);
      continue;
    }
    const { name, value } = n;
    if (!value.trim()) return at(n, `${name}: needs a value`);
    switch (name) {
      case 'kind': {
        const values = list(value, n);
        if (values.some(v => !/^\d+$/.test(v) || Number(v) > 65535)) return at(n, 'kind: needs integers from 0 to 65535');
        plan.filter.kinds = intersect(plan.filter.kinds, values.map(Number), n);
        break;
      }
      case 'by': case 'from': plan.authors.push(list(value, n)); break;
      case 'mentions':
        if (plan.mentions.length) return at(n, 'Use one mentions: list or OR between mentions: filters');
        plan.mentions.push(list(value, n)); break;
      case 'since': case 'until': {
        const date = parseDateValue(value, name, now);
        if (!date) return at(n, `Use a valid ${name}:YYYY-MM-DD or relative date such as ${name}:2w`);
        const previous = plan.filter[name];
        plan.filter[name] = previous === undefined ? date.timestamp : name === 'since' ? Math.max(previous, date.timestamp) : Math.min(previous, date.timestamp);
        break;
      }
      case 'a': case 'license': {
        const key = `#${name}` as const;
        if (plan.filter[key] && !plan.filter[key]?.includes(value)) return at(n, `Use OR between different ${name}: values`);
        plan.filter[key] = [value]; break;
      }
      case 'p':
        if (plan.profile !== undefined) return at(n, 'Use OR between profile searches');
        plan.profile = value;
        plan.filter.kinds = intersect(plan.filter.kinds, [0], n);
        break;
      case 'include': case 'domain': case 'language': case 'sentiment': case 'nsfw':
        if (/\s/.test(value) || (name === 'include' && value !== 'spam') || (name === 'language' && !/^[a-z]{2}$/i.test(value)) ||
            (name === 'sentiment' && !['negative', 'neutral', 'positive'].includes(value)) || (name === 'nsfw' && !['true', 'false'].includes(value))) return at(n, `Invalid ${name}: value`);
        if (extensions.has(name) && extensions.get(name) !== value) return at(n, `Conflicting ${name}: values`);
        extensions.set(name, value); break;
      default: return at(n, `Unsupported modifier '${name}:'`);
    }
  }
  if (plan.filter.since !== undefined && plan.filter.until !== undefined && plan.filter.since > plan.filter.until) return at(leaves[0], 'since: must not be after until:');
  if (!plan.filter.kinds) plan.filter.kinds = defaultKinds;
  if (plan.profile !== undefined) {
    if (extensions.size) return at(leaves[0], 'NIP-50 extensions cannot be combined with p: profile lookup');
    plan.profile = [plan.profile, ...text].join(' ');
  } else {
    const base = text.join(' ');
    const search = [...(base ? [exact ? JSON.stringify(base) : base] : []), ...Array.from(extensions, ([key, value]) => `${key}:${value}`)].join(' ');
    if (search) plan.filter.search = search;
  }
  return plan;
}
export function planQuery(source: string, rules: AliasRule[], defaultKinds: number[], now = new Date(), exact = false) {
  const tree = compactLists(expandAliases(parseQuery(source), rules));
  const leaves = branchLeaves(tree);
  return { tree, leaves, branches: leaves.map(branch => compileBranch(branch, defaultKinds, now, exact)) };
}

/** Remove a proven common author restriction when navigating to its profile URL.
 * Undefined is the unrestricted/true expression: AND drops it, OR absorbs it.
 */
export function withoutAuthorFields(node: QueryNode): QueryNode | undefined {
  if (node.type === 'field' && ['by', 'from'].includes(node.name)) return undefined;
  if (node.type !== 'and' && node.type !== 'or') return node;
  const children = node.children.map(withoutAuthorFields);
  if (node.type === 'or' && children.some(n => !n)) return undefined;
  const retained = children.filter((n): n is QueryNode => !!n);
  if (!retained.length) return undefined;
  return retained.length === 1 ? retained[0] : { ...node, children: retained };
}
