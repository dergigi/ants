import { NDKEvent } from '@nostr-dev-kit/ndk';
import { type FollowPackData } from '@/components/FollowPackCard';
import { FOLLOW_PACK_KIND } from './constants';

export function parseFollowPackTags(event: NDKEvent): FollowPackData | null {
  if (event.kind !== FOLLOW_PACK_KIND) return null;

  let title: string | undefined;
  let description: string | undefined;
  let image: string | undefined;
  const memberPubkeysSet = new Set<string>();

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    const [tagName, ...rest] = tag;

    if (tagName === 'title' && rest[0]) {
      title = rest[0];
    } else if (tagName === 'description' && rest[0]) {
      description = rest[0];
    } else if (tagName === 'image' && rest[0]) {
      image = rest[0];
    } else if (tagName === 'p' && rest[0]) {
      memberPubkeysSet.add(rest[0]);
    }
  }

  const memberPubkeys = Array.from(memberPubkeysSet);

  return {
    title,
    description,
    image,
    memberCount: memberPubkeys.length,
    memberPubkeys
  };
}
