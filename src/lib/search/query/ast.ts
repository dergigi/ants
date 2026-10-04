export interface Span { start: number; end: number }
export type Leaf =
  | { type: 'text' | 'phrase'; value: string; span: Span }
  | { type: 'field'; name: string; value: string; quoted: boolean; span: Span };
export type QueryNode = Leaf | { type: 'and'; children: QueryNode[]; span: Span } | { type: 'or'; children: QueryNode[]; span: Span };
export const QUERY_LIMITS = { characters: 2000, depth: 16, nodes: 256, branches: 32, concurrent: 4 } as const;
export class QueryError extends Error {
  constructor(message: string, public readonly span: Span = { start: 0, end: 0 }) {
    super(`${message} (character ${span.start + 1})`);
    this.name = 'QueryError';
  }
}
export function printQuery(node: QueryNode): string {
  if (node.type === 'and' || node.type === 'or') {
    return `(${node.children.map(printQuery).join(node.type === 'or' ? ' OR ' : ' AND ')})`;
  }
  if (node.type === 'field') return `${node.name}:${node.quoted ? JSON.stringify(node.value) : node.value}`;
  return node.type === 'phrase' ? JSON.stringify(node.value) : node.value;
}
