'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function EventDeepLinkPage() {
  const params = useParams<{ nevent: string }>();
  const router = useRouter();
  const nevent = (params?.nevent || '').trim();

  useEffect(() => {
    if (!nevent) return;
    // Accept nevent or note identifiers; just forward as a root query
    const q = nevent;
    const url = `/?q=${encodeURIComponent(q)}`;
    router.replace(url);
  }, [nevent, router]);

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100 flex items-center justify-center">
      <div className="text-gray-300 text-sm">Redirecting to event…</div>
    </main>
  );
}


