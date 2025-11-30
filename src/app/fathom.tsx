'use client';

import { load, trackPageview } from 'fathom-client';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function TrackPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FATHOM_ID) return;

    load(process.env.NEXT_PUBLIC_FATHOM_ID, {
      auto: false,
    });
  }, []);

  useEffect(() => {
    if (!pathname) return;

    const search = searchParams?.toString();

    trackPageview({
      url: search ? `${pathname}?${search}` : pathname,
      referrer: document.referrer,
    });
  }, [pathname, searchParams]);

  return null;
}

export function FathomAnalytics() {
  return (
    <Suspense fallback={null}>
      <TrackPageView />
    </Suspense>
  );
}


