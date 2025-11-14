'use client';

import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShare, faCheck } from '@fortawesome/free-solid-svg-icons';

interface ShareButtonProps {
  url?: string;
}

export default function ShareButton({ url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { 
    if (timerRef.current) clearTimeout(timerRef.current); 
  }, []);

  const handleShare = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    
    try {
      // Try native Web Share API first if available
      if (navigator.share && typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Ants Search',
          url: shareUrl,
        });
        return;
      }
      
      // Fallback to clipboard
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // User cancelled share or clipboard failed - silently fail
    }
  };

  return (
    <button
      type="button"
      className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
      onClick={handleShare}
      title={copied ? 'Copied!' : 'Share this search'}
    >
      <FontAwesomeIcon 
        icon={copied ? faCheck : faShare} 
        className="w-3 h-3 text-gray-500" 
      />
    </button>
  );
}

