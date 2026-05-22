'use client';

/**
 * Thin wrapper that mounts {@link NamecoinResolutionIndicator} into the
 * SearchView search header.
 *
 * Pulling this into its own component keeps the new Namecoin wiring
 * out of `SearchView.tsx`, which is already over the 420-line
 * repository limit. Future search-header–scoped chain UI (extra
 * badges, fallback banners, ifa-0001 import walkthroughs) should land
 * here rather than further bloating `SearchView`.
 */
import NamecoinResolutionIndicator from '@/components/NamecoinResolutionIndicator';

export default function NamecoinSearchHeader({ query }: { query: string }) {
  return <NamecoinResolutionIndicator query={query} />;
}
