"use client";

import type { ReactNode } from "react";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import EventCard from "@/components/EventCard";

// Keep the existing card interface; shared EventCard rendering also covers quotes.
export default function MuteListCard(props: {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  footerRight?: ReactNode;
  className?: string;
}) {
  return <EventCard {...props} renderContent={() => null} />;
}
