import { NDKUser } from '@nostr-dev-kit/ndk';

export type ProfileScopeIdentifiers = {
  npub: string;
  nip05?: string;
  identifier: string;
};

const BY_TOKEN_REGEX = /(^|\s)by:([^\s),.;]+)(?=[\s),.;]|$)/gi;

type Nip05Like = string | { url?: string | undefined } | undefined;

function normalizeIdentifier(value?: string): string {
  const trimmed = (value || '').trim();
  const withoutLocalUnderscores = trimmed.replace(/^_+/, '');
  if (withoutLocalUnderscores.startsWith('@')) {
    return withoutLocalUnderscores.slice(1).toLowerCase();
  }
  return withoutLocalUnderscores.toLowerCase();
}

function extractNip05(user: NDKUser | null): string | undefined {
  const raw = user?.profile?.nip05 as Nip05Like;
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && 'url' in raw && typeof raw.url === 'string') return raw.url;
  return undefined;
}

export function getProfileScopeIdentifiers(user: NDKUser | null, currentProfileNpub: string | null): ProfileScopeIdentifiers | null {
  if (!currentProfileNpub) return null;
  const nip05 = extractNip05(user);
  const identifier = nip05 && nip05.trim().length > 0 ? nip05 : currentProfileNpub;
  return { npub: currentProfileNpub, nip05, identifier };
}

function tokenMatchesProfile(token: string, identifiers: ProfileScopeIdentifiers): boolean {
  const normalizedToken = normalizeIdentifier(token);
  if (normalizedToken === normalizeIdentifier(identifiers.identifier)) return true;
  return false;
}

export function hasProfileScope(query: string, identifiers: ProfileScopeIdentifiers): boolean {
  BY_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BY_TOKEN_REGEX.exec(query)) !== null) {
    if (tokenMatchesProfile(match[2] || '', identifiers)) {
      return true;
    }
  }
  return false;
}

export function replaceProfileScopeIdentifier(query: string, identifiers: ProfileScopeIdentifiers): string {
  const value = identifiers.identifier;
  BY_TOKEN_REGEX.lastIndex = 0;
  const replaced = query.replace(BY_TOKEN_REGEX, (full, pre, token) => {
    return tokenMatchesProfile(token || '', identifiers) ? `${pre || ''}by:${value}` : full;
  });
  return replaced;
}

export function addProfileScope(query: string, identifiers: ProfileScopeIdentifiers): string {
  const trimmed = query.trim();
  if (hasProfileScope(trimmed, identifiers)) {
    return replaceProfileScopeIdentifier(trimmed, identifiers);
  }
  const value = identifiers.identifier;
  if (!trimmed) return `by:${value}`;
  return `${trimmed} by:${value}`.trim();
}

export function removeProfileScope(query: string, identifiers: ProfileScopeIdentifiers): string {
  BY_TOKEN_REGEX.lastIndex = 0;
  const result = query.replace(BY_TOKEN_REGEX, (full, pre, token) => {
    return tokenMatchesProfile(token || '', identifiers) ? pre || '' : full;
  });
  return result.replace(/\s{2,}/g, ' ').trim();
}

export function applyProfileScopePreference(query: string, identifiers: ProfileScopeIdentifiers, enabled: boolean): string {
  return enabled ? addProfileScope(query, identifiers) : removeProfileScope(query, identifiers);
}
