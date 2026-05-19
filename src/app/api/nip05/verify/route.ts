import { NextResponse } from 'next/server';
import { nip05 } from 'nostr-tools';
import { normalizeNip05String } from '@/lib/nip05';
import { isDotBit, isValidNamecoinNip05 } from '@/lib/namecoin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pubkey = (searchParams.get('pubkey') || '').trim();
    const nip05Raw = (searchParams.get('nip05') || '').trim();
    if (!pubkey || !nip05Raw) {
      return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 });
    }
    // Route `.bit` (Namecoin) identifiers through the chain resolver.
    if (isDotBit(nip05Raw)) {
      const ok = await isValidNamecoinNip05(pubkey, nip05Raw);
      return NextResponse.json({ ok, normalized: nip05Raw, source: 'namecoin' }, { status: 200 });
    }
    const normalized = normalizeNip05String(nip05Raw);
    if (!normalized) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    const ok = await nip05.isValid(pubkey, normalized as `${string}@${string}`);
    return NextResponse.json({ ok, normalized }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'error' }, { status: 500 });
  }
}


