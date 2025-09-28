import { NDKUser } from '@nostr-dev-kit/ndk';

export type ProfileScopeIdentifiers = {
  npub: string;
  nip05?: string;
  identifier: string;
  normalizedIdentifier: string;
  normalizedNpub: string;
  normalizedNip05?: string;
  hasNip05: boolean;
  profileIdentifier: string;
};

const BY_TOKEN_REGEX = /(^|\s)by:([^\s),.;]+)(?=[\s),.;]|$)/gi;

type Nip05Like = string | { url?: string | undefined } | undefined;

function sanitizeNip05(value?: string): string | undefined {
  if (!value) return undefined;
  let trimmed = value.trim();
  trimmed = trimmed.replace(/^_+/, '');
  if (!trimmed) return undefined;
  if (!trimmed.startsWith('@') && trimmed.includes('@')) {
    trimmed = `@${trimmed}`;
  }
  return trimmed;
}

function normalizeIdentifier(value?: string): string {
  const trimmed = (value || '').trim();
  const withoutLeadingUnderscores = trimmed.replace(/^_+/, '');
  const withoutAtPrefix = withoutLeadingUnderscores.replace(/^@+/, '');
  return withoutAtPrefix.toLowerCase();
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
  const nip05Raw = extractNip05(user);
  const nip05 = sanitizeNip05(nip05Raw);
  const hasNip05 = !!nip05;
  const profileIdentifier = hasNip05 ? nip05! : currentProfileNpub;
  const identifier = profileIdentifier;
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const normalizedNpub = normalizeIdentifier(currentProfileNpub);
  const normalizedNip05 = nip05 ? normalizeIdentifier(nip05) : undefined;
  
  return { 
    npub: currentProfileNpub, 
    nip05, 
    identifier, 
    normalizedIdentifier, 
    normalizedNpub, 
    normalizedNip05,
    hasNip05,
    profileIdentifier
  };
}

function tokenMatchesProfile(token: string, identifiers: ProfileScopeIdentifiers): boolean {
  const normalizedToken = normalizeIdentifier(token);
  if (!normalizedToken) return false;
  if (normalizedToken === identifiers.normalizedIdentifier) return true;
  if (normalizedToken === identifiers.normalizedNpub) return true;
  if (identifiers.normalizedNip05 && normalizedToken === identifiers.normalizedNip05) return true;
  return false;
}

export function containsProfileScope(query: string, identifiers: ProfileScopeIdentifiers): boolean {
  BY_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BY_TOKEN_REGEX.exec(query)) !== null) {
    if (tokenMatchesProfile(match[2] || '', identifiers)) {
      return true;
    }
  }
  return false;
}

export function hasProfileScope(query: string, identifiers: ProfileScopeIdentifiers): boolean {
  return containsProfileScope(query, identifiers);
}

export function replaceProfileScopeIdentifier(query: string, identifiers: ProfileScopeIdentifiers): string {
  const value = identifiers.profileIdentifier;
  BY_TOKEN_REGEX.lastIndex = 0;
  const replaced = query.replace(BY_TOKEN_REGEX, (full, pre, token) => {
    return tokenMatchesProfile(token || '', identifiers) ? `${pre || ''}by:${value}` : full;
  });
  return replaced;
}

export function addProfileScope(query: string, identifiers: ProfileScopeIdentifiers): string {
  const trimmed = query.trim();
  if (containsProfileScope(trimmed, identifiers)) {
    return replaceProfileScopeIdentifier(trimmed, identifiers);
  }
  const value = identifiers.profileIdentifier;
  if (!trimmed) return `by:${value}`;
  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    if (tokenMatchesProfile(token.replace(/^by:/i, ''), identifiers)) {
      return replaceProfileScopeIdentifier(trimmed, identifiers);
    }
  }
  return `${trimmed} by:${value}`.trim();
}

export function removeProfileScope(query: string, identifiers: ProfileScopeIdentifiers): string {
  BY_TOKEN_REGEX.lastIndex = 0;
  const result = query.replace(BY_TOKEN_REGEX, (full, pre, token) => {
    return tokenMatchesProfile(token || '', identifiers) ? pre || '' : full;
  });
  return result.replace(/\s{2,}/g, ' ').trim();
}
