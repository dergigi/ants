'use client';

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faCheck } from '@fortawesome/free-solid-svg-icons';

type Props = {
  text: string;
  title?: string;
  className?: string;
};

export default function CopyButton({ text, title = 'Copy', className }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { 
    if (timerRef.current) clearTimeout(timerRef.current); 
  }, []);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try { 
      await navigator.clipboard.writeText(text); 
    } catch {}
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      title={copied ? 'Copied' : title}
      aria-label={copied ? 'Copied' : title}
      className={`w-6 h-6 rounded-md border border-[#3d3d3d] text-gray-300 hover:bg-[#2a2a2a] flex items-center justify-center ${className || ''}`.trim()}
      onClick={handleCopy}
    >
      <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-xs" />
    </button>
  );
}
