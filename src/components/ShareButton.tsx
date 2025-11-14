'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareNodes, faCheck, faCopy } from '@fortawesome/free-solid-svg-icons';
import { calculateAbsoluteMenuPosition } from '@/lib/utils';

interface ShareButtonProps {
  url?: string;
}

export default function ShareButton({ url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => { 
    if (timerRef.current) clearTimeout(timerRef.current); 
  }, []);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const position = calculateAbsoluteMenuPosition(rect, 180);
      setMenuPosition(position);
    }
    setShowMenu((prev) => !prev);
  };

  const handleCopyUrl = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setShowMenu(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // Clipboard failed - silently fail
    }
  };

  const handleShareWith = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      if (navigator.share && typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Ants Search',
          url: shareUrl,
        });
        setShowMenu(false);
      }
    } catch (err) {
      // User cancelled share - silently fail
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="flex items-center gap-2 text-sm transition-colors touch-manipulation text-gray-400 hover:text-gray-300"
        onClick={handleButtonClick}
        title="Share this search"
      >
        <FontAwesomeIcon 
          icon={copied ? faCheck : faShareNodes} 
          className="w-3 h-3 text-gray-500" 
        />
      </button>
      {showMenu && typeof window !== 'undefined' && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => { e.preventDefault(); setShowMenu(false); }}
          />
          <div
            className="fixed z-[9999] bg-[#1f1f1f] border border-[#3d3d3d] rounded-md shadow-lg min-w-[180px]"
            style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="py-1 text-sm text-gray-200">
              <li>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-[#3a3a3a] flex items-center gap-2"
                  onClick={handleCopyUrl}
                >
                  <FontAwesomeIcon icon={faCopy} className="text-xs text-gray-400" />
                  <span>Copy URL</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-[#3a3a3a] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleShareWith}
                  disabled={!navigator.share || typeof navigator.share !== 'function'}
                >
                  <FontAwesomeIcon icon={faShareNodes} className="text-xs text-gray-400" />
                  <span>Share With...</span>
                </button>
              </li>
            </ul>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

