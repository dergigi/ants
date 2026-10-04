import { parseQuery } from './query/parse';
import { printQuery } from './query/ast';
import { guaranteesAuthor, mapAuthors, removeMatchingAuthor, withAuthor } from './query/scope';
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

type Nip05Like = string | { url?: string | undefined } | undefined;

function sanitizeNip05(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeIdentifier(value);
  if (!normalized) return undefined;
  return normalized;
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
  const normalizedNip05 = nip05; // nip05 is already normalized by sanitizeNip05
  
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
  try { return guaranteesAuthor(parseQuery(query), value => tokenMatchesProfile(value, identifiers)); }
  catch { return false; }
}

export const hasProfileScope = containsProfileScope;

export function replaceProfileScopeIdentifier(query: string, identifiers: ProfileScopeIdentifiers): string {
  try { return printQuery(mapAuthors(parseQuery(query), value => tokenMatchesProfile(value, identifiers), identifiers.profileIdentifier)); }
  catch { return query; }
}

export function addProfileScope(query: string, identifiers: ProfileScopeIdentifiers): string {
  return containsProfileScope(query, identifiers)
    ? replaceProfileScopeIdentifier(query, identifiers)
    : withAuthor(query, identifiers.profileIdentifier, false);
}

export function removeProfileScope(query: string, identifiers: ProfileScopeIdentifiers): string {
  try {
    const tree = parseQuery(query);
    const matches = (value: string) => tokenMatchesProfile(value, identifiers);
    if (!guaranteesAuthor(tree, matches)) return query;
    const remaining = removeMatchingAuthor(tree, matches);
    return remaining ? printQuery(remaining) : '';
  } catch { return query; }
}
