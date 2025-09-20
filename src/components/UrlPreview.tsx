'use client';

import Image from 'next/image';
import { isAbsoluteHttpUrl } from '@/lib/urlPatterns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

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
  onSearch?: (url: string) => void;
  onLoaded?: (url: string) => void;
};

export default function UrlPreview({ url, className, onSearch, onLoaded }: Props) {
  const [data, setData] = useState<OgData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef(true);
  const notifiedLoadedRef = useRef(false);

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
        if ('error' in json) throw new Error(json.error);
        setData(json as OgData);
      } catch (e: unknown) {
        if (!mountedRef.current) return;
        const errorMessage = e instanceof Error ? e.message : 'Failed';
        setError(errorMessage);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => { mountedRef.current = false; ac.abort(); };
  }, [url]);

  // Notify parent once after successful load
  useEffect(() => {
    if (!notifiedLoadedRef.current && data && !error && onLoaded) {
      notifiedLoadedRef.current = true;
      onLoaded(data.url || url);
    }
  }, [data, error, onLoaded, url]);

  if (loading) return null;
  if (error || !data) return null;

  const title = data.title || originHostname;
  const description = data.description || '';
  const image = data.image;
  // Favicon intentionally not shown

  return (
    <div className={`relative group ${className || ''}`}>
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
          {image && isAbsoluteHttpUrl(image) ? (
            <div className="relative flex-shrink-0 w-24 h-24 bg-[#2a2a2a] border border-[#3d3d3d] rounded overflow-hidden">
              {/* next/image remote allowed in next.config.ts */}
              <Image src={image} alt={title} fill sizes="96px" className="object-cover" unoptimized />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center text-sm text-gray-300 mb-1">
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
      {onSearch ? (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 z-10 p-0.5 text-gray-400 hover:text-gray-200 bg-transparent border-0 opacity-60 group-hover:opacity-100 transition-opacity"
          title="Search for this URL"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSearch(data.url || url);
          }}
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}


