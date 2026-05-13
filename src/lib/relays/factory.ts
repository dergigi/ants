import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ensureCacheInitialized, ndk } from '../ndk';

export async function createRelaySet(urls: string[]): Promise<NDKRelaySet> {
  await ensureCacheInitialized();
  return NDKRelaySet.fromRelayUrls(urls, ndk);
}
