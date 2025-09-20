// Utilities to keep profile-page query handling DRY

// Regexes
const BY_TOKEN_RX = /(^|\s)by:(\S+)(?=\s|$)/i;
const BY_NPUB_RX = /(^|\s)by:(npub1[0-9a-z]+)(?=\s|$)/ig;

export function getCurrentProfileNpub(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/p\/(npub1[0-9a-z]+)/i);
  return m ? m[1] : null;
}

// For the URL bar on /p pages: strip a matching by:<current npub> from the query
export function toImplicitUrlQuery(explicitQuery: string, currentNpub: string | null): string {
  if (!explicitQuery) return '';
  if (!currentNpub) return explicitQuery.trim();
  return explicitQuery
    .replace(BY_NPUB_RX, (m, pre: string, npub: string) => {
      return npub.toLowerCase() === currentNpub.toLowerCase() ? (pre ? pre : '') : m;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// For the input on /p pages: ensure by:<current npub> is visible/explicit alongside urlQuery
export function toExplicitInputFromUrl(urlQuery: string, currentNpub: string | null): string {
  if (!currentNpub) return (urlQuery || '').trim();
  const base = (urlQuery || '').trim();
  if (!base) return `by:${currentNpub}`;
  return /(^|\s)by:\S+(?=\s|$)/i.test(base) ? base : `${base} by:${currentNpub}`;
}

// For backend searches on /p pages: ensure by:<current npub> filter is included
export function ensureAuthorForBackend(query: string, currentNpub: string | null): string {
  const base = (query || '').trim();
  if (!currentNpub) return base;
  if (BY_TOKEN_RX.test(base)) return base; // already has a by: token
  return base ? `${base} by:${currentNpub}` : `by:${currentNpub}`;
}


