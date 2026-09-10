import { nip19 } from 'nostr-tools';
import { getStoredPubkey } from '@/lib/nip07';
import { resolveAuthorToNpub } from '@/lib/vertex';

const NPUB_RX = /^npub1[0-9a-z]+$/i;
const AUTHOR_SCOPE_RX = /(^|\s)(by|mentions):(\S+)/gi;
const TRAILING_PUNCT_RX = /^([^),.;]+)([),.;]*)$/;
const DEFAULT_AUTHOR_RESOLUTION_TIMEOUT_MS = 2500;

export type ScopedAuthorToken = {
  pre: string;
  scope: 'by' | 'mentions';
  raw: string;
  core: string;
  suffix: string;
  index: number;
  full: string;
};

export type ScopedAuthorResolutionOptions = {
  onMissingMe?: 'keep' | 'flag';
  timeoutMs?: number;
  cache?: Map<string, string>;
  authorResolver?: (author: string) => Promise<string | null>;
};

export type ScopedAuthorResolutionResult = {
  query: string;
  byAuthors: string[];
  mentionAuthors: string[];
  needsLoginForAtMe: boolean;
  changed: boolean;
};

function splitTokenSuffix(raw: string): { core: string; suffix: string } {
  const match = raw.match(TRAILING_PUNCT_RX);
  return {
    core: (match && match[1]) || raw,
    suffix: (match && match[2]) || ''
  };
}

function getStoredNpub(): string | null {
  const storedPubkey = getStoredPubkey();
  if (!storedPubkey) return null;
  try {
    return nip19.npubEncode(storedPubkey);
  } catch {
    return null;
  }
}

export function isNpubAuthorToken(token: string): boolean {
  return NPUB_RX.test((token || '').trim());
}

export function extractScopedAuthorTokens(query: string): ScopedAuthorToken[] {
  AUTHOR_SCOPE_RX.lastIndex = 0;
  const tokens: ScopedAuthorToken[] = [];
  let match: RegExpExecArray | null;

  while ((match = AUTHOR_SCOPE_RX.exec(query)) !== null) {
    const pre = match[1] || '';
    const scope = (match[2] || '').toLowerCase() as 'by' | 'mentions';
    const raw = match[3] || '';
    const { core, suffix } = splitTokenSuffix(raw);
    tokens.push({
      pre,
      scope,
      raw,
      core,
      suffix,
      index: match.index,
      full: match[0]
    });
  }

  return tokens;
}

async function resolveAuthorCore(
  core: string,
  options: ScopedAuthorResolutionOptions
): Promise<{ value: string; needsLoginForAtMe: boolean }> {
  if (isNpubAuthorToken(core)) {
    return { value: core, needsLoginForAtMe: false };
  }

  if (/^@me$/i.test(core)) {
    const storedNpub = getStoredNpub();
    return storedNpub
      ? { value: storedNpub, needsLoginForAtMe: false }
      : { value: core, needsLoginForAtMe: true };
  }

  const cacheKey = core.trim();
  const cached = options.cache?.get(cacheKey);
  if (cached) {
    return { value: cached, needsLoginForAtMe: false };
  }

  const resolver = options.authorResolver || resolveAuthorToNpub;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AUTHOR_RESOLUTION_TIMEOUT_MS;

  try {
    const timed = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const resolved = await Promise.race([resolver(core), timed]);
    if (resolved) {
      options.cache?.set(cacheKey, resolved);
      return { value: resolved, needsLoginForAtMe: false };
    }
  } catch {}

  return { value: core, needsLoginForAtMe: false };
}

export async function resolveScopedAuthorTokens(
  query: string,
  options: ScopedAuthorResolutionOptions = {}
): Promise<ScopedAuthorResolutionResult> {
  const tokens = extractScopedAuthorTokens(query);
  if (!tokens.length) {
    return {
      query,
      byAuthors: [],
      mentionAuthors: [],
      needsLoginForAtMe: false,
      changed: false
    };
  }

  let result = '';
  let lastIndex = 0;
  let changed = false;
  let needsLoginForAtMe = false;
  const byAuthors: string[] = [];
  const mentionAuthors: string[] = [];
  const onMissingMe = options.onMissingMe || 'keep';

  for (const token of tokens) {
    const { value, needsLoginForAtMe: tokenNeedsLogin } = await resolveAuthorCore(token.core, options);
    const resolvedValue = tokenNeedsLogin && onMissingMe === 'flag' ? token.core : value;
    const replacement = `${token.pre}${token.scope}:${resolvedValue}${token.suffix}`;

    needsLoginForAtMe ||= tokenNeedsLogin;
    changed ||= replacement !== token.full;

    result += query.slice(lastIndex, token.index);
    result += replacement;
    lastIndex = token.index + token.full.length;

    if (token.scope === 'by') {
      byAuthors.push(resolvedValue);
    } else {
      mentionAuthors.push(resolvedValue);
    }
  }

  result += query.slice(lastIndex);

  return {
    query: result,
    byAuthors,
    mentionAuthors,
    needsLoginForAtMe,
    changed
  };
}
