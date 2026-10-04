import { QueryNode, printQuery } from './ast';
import { parseQuery } from './parse';

export function isAuthor(node: QueryNode): node is Extract<QueryNode, { type: 'field' }> {
  return node.type === 'field' && (node.name === 'by' || node.name === 'from');
}
export function hasAuthor(node: QueryNode): boolean {
  return isAuthor(node) || ((node.type === 'and' || node.type === 'or') && node.children.some(hasAuthor));
}
export function guaranteesAuthor(node: QueryNode, matches: (value: string) => boolean): boolean {
  if (isAuthor(node)) return node.value.split(',').every(value => !!value.trim() && matches(value.trim()));
  if (node.type === 'and') return node.children.some(n => guaranteesAuthor(n, matches));
  if (node.type === 'or') return node.children.every(n => guaranteesAuthor(n, matches));
  return false;
}
export function mapAuthors(node: QueryNode, matches: (value: string) => boolean, replacement: string): QueryNode {
  if (node.type === 'and' || node.type === 'or') return { ...node, children: node.children.map(n => mapAuthors(n, matches, replacement)) };
  if (!isAuthor(node)) return node;
  return { ...node, value: node.value.split(',').map(value => matches(value.trim()) ? replacement : value).join(',') };
}
export function removeMatchingAuthor(node: QueryNode, matches: (value: string) => boolean): QueryNode | undefined {
  if (isAuthor(node) && guaranteesAuthor(node, matches)) return undefined;
  if (node.type !== 'and' && node.type !== 'or') return node;
  const children = node.children.map(n => removeMatchingAuthor(n, matches));
  if (node.type === 'or' && children.some(n => !n)) return undefined;
  const retained = children.filter((n): n is QueryNode => !!n);
  return retained.length === 0 ? undefined : retained.length === 1 ? retained[0] : { ...node, children: retained };
}
export function withAuthor(query: string, identifier: string, preserveExplicitAuthors: boolean): string {
  const field: QueryNode = { type: 'field', name: 'by', value: identifier, quoted: /[\s():"\\]/.test(identifier), span: { start: 0, end: 0 } };
  if (!query.trim()) return printQuery(field);
  try {
    const tree = parseQuery(query);
    if (preserveExplicitAuthors && hasAuthor(tree)) return query.trim();
    return printQuery({ type: 'and', children: [tree, field], span: tree.span });
  } catch { return query.trim(); } // Do not rewrite an incomplete editor buffer.
}
