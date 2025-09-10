'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

type OgData = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  favicon?: string;
};

type Props = {
  url: string;
  className?: string;
};

export default function UrlPreview({ url, className }: Props) {
  const [data, setData] = useState<OgData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef(true);

  const originHostname = useMemo(() => {
    try { return new URL(url).hostname; } catch { return ''; }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const params = new URLSearchParams({ url });
        const res = await fetch(`/api/og?${params.toString()}`, { signal: ac.signal, cache: 'force-cache' });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as OgData | { error: string };
        if (!mountedRef.current) return;
        if ((json as any).error) throw new Error((json as any).error);
        setData(json as OgData);
      } catch (e: any) {
        if (!mountedRef.current) return;
        setError(e?.message || 'Failed');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => { mountedRef.current = false; ac.abort(); };
  }, [url]);

  if (loading) return null;
  if (error || !data) return null;

  const title = data.title || originHostname;
  const description = data.description || '';
  const image = data.image;
  const favicon = data.favicon;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ||
        'block rounded-md border border-[#3d3d3d] bg-[#1f1f1f] overflow-hidden hover:border-[#4a4a4a] transition-colors'
      }
    >
      <div className="flex gap-3 p-3">
        {image ? (
          <div className="relative flex-shrink-0 w-24 h-24 bg-[#2a2a2a] border border-[#3d3d3d] rounded overflow-hidden">
            {/* next/image remote allowed in next.config.ts */}
            <Image src={image} alt={title} fill sizes="96px" className="object-cover" unoptimized />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-gray-300 mb-1">
            {favicon ? (
              <Image src={favicon} alt="favicon" width={16} height={16} className="inline-block" unoptimized />
            ) : null}
            <span className="truncate opacity-80">{data.siteName || originHostname}</span>
          </div>
          <div className="text-gray-100 font-medium truncate mb-1">{title}</div>
          {description ? (
            <div className="text-gray-300 text-sm line-clamp-2 break-words">
              {description}
            </div>
          ) : null}
        </div>
      </div>
    </a>
  );
}


