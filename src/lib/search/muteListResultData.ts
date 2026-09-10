import { NDKEvent } from '@nostr-dev-kit/ndk';

export type MuteListResultData = {
  pubkeys: string[];
  profiles: NDKEvent[];
};

const muteListResultData = new WeakMap<NDKEvent, MuteListResultData>();

export function setMuteListResultData(event: NDKEvent, data: MuteListResultData): NDKEvent {
  muteListResultData.set(event, {
    pubkeys: [...data.pubkeys],
    profiles: [...data.profiles]
  });
  return event;
}

export function getMuteListResultData(event: NDKEvent): MuteListResultData | null {
  return muteListResultData.get(event) || null;
}
