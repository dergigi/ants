import { CharStream, CommonTokenStream, ErrorListener, ParserRuleContext, Recognizer, Token } from 'antlr4';
import AntsQueryLexer from './generated/AntsQueryLexer';
import AntsQueryParser, { ExpressionContext, PrimaryContext, ScopedFieldContext, FieldContext, GroupContext, PhraseContext } from './generated/AntsQueryParser';
import { QueryError, QueryNode, QUERY_LIMITS, Span } from './ast';

function span(ctx: ParserRuleContext): Span {
  return { start: ctx.start.start, end: (ctx.stop?.stop ?? ctx.start.stop) + 1 };
}
function listener<T>(source: string): ErrorListener<T> {
  return new class extends ErrorListener<T> {
    syntaxError(_r: Recognizer<T>, _symbol: T, line: number, column: number, message: string) {
      const start = source.split('\n').slice(0, line - 1).reduce((n, part) => n + part.length + 1, 0) + column;
      throw new QueryError(`Invalid search: ${message}`, { start, end: Math.min(source.length, start + 1) });
    }
  }();
}
function scope(node: QueryNode, name: string): QueryNode {
  if (node.type === 'and' || node.type === 'or') return { ...node, children: node.children.map(n => scope(n, name)) };
  if (node.type === 'field') throw new QueryError('A scoped group contains values, not another field', node.span);
  return { type: 'field', name, value: node.value, quoted: node.type === 'phrase', span: node.span };
}
function primary(ctx: PrimaryContext): QueryNode {
  if (ctx instanceof ScopedFieldContext) return scope(expression(ctx.expression()), ctx.WORD().getText().toLowerCase());
  if (ctx instanceof GroupContext) return { ...expression(ctx.expression()), span: span(ctx) };
  if (ctx instanceof FieldContext) {
    const value = ctx.value().getText();
    return { type: 'field', name: ctx.WORD().getText().toLowerCase(), value: value.startsWith('"') ? JSON.parse(value) : value, quoted: value.startsWith('"'), span: span(ctx) };
  }
  const raw = ctx.getText();
  return { type: ctx instanceof PhraseContext ? 'phrase' : 'text', value: ctx instanceof PhraseContext ? JSON.parse(raw) : raw, span: span(ctx) };
}
function expression(ctx: ExpressionContext): QueryNode {
  const children = ctx.conjunction_list().map(c => {
    const parts = c.primary_list().map(primary);
    return parts.length === 1 ? parts[0] : { type: 'and' as const, children: parts, span: span(c) };
  });
  return children.length === 1 ? children[0] : { type: 'or', children, span: span(ctx) };
}
export function parseQuery(source: string): QueryNode {
  if (!source.trim()) throw new QueryError('Enter a search first');
  if (source.length > QUERY_LIMITS.characters) throw new QueryError(`Use at most ${QUERY_LIMITS.characters} characters`);
  // UTF-16 offsets match browser selection APIs and Java String offsets.
  const lexer = new AntsQueryLexer(new CharStream(source, false));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener<number>(source));
  const tokens = new CommonTokenStream(lexer);
  tokens.fill();
  let depth = 0;
  if (tokens.tokens.length > QUERY_LIMITS.nodes * 4) throw new QueryError('Search contains too many tokens');
  for (const token of tokens.tokens) {
    if (token.type === AntsQueryLexer.LPAREN && ++depth > QUERY_LIMITS.depth) throw new QueryError(`Use at most ${QUERY_LIMITS.depth} nested groups`, { start: token.start, end: token.stop + 1 });
    if (token.type === AntsQueryLexer.RPAREN) depth--;
  }
  const parser = new AntsQueryParser(tokens);
  parser.removeErrorListeners();
  parser.addErrorListener(listener<Token>(source));
  const tree = expression(parser.query().expression());
  let count = 0;
  function check(n: QueryNode) {
    if (++count > QUERY_LIMITS.nodes) throw new QueryError('Search contains too many terms', n.span);
    if (n.type === 'and' || n.type === 'or') n.children.forEach(check);
  }
  check(tree);
  return tree;
}
