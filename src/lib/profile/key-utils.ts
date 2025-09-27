export function normalizePubkey(pubkeyHex: string | undefined | null): string | null {
  if (!pubkeyHex) return null;
  try {
    return pubkeyHex.trim().toLowerCase();
  } catch {
    return null;
  }
}


