'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCode, faMobileScreenButton } from '@fortawesome/free-solid-svg-icons';

export type ExplorerMenuItem = { name: string; href: string; dividerAfter?: boolean };

type Props = {
  position: { top: number; left: number };
  onClose: () => void;
  portalItems: ExplorerMenuItem[];
  clientItems: ExplorerMenuItem[];
  showRaw: boolean;
  onToggleRaw: () => void;
};

/**
 * Shared createPortal dropdown used by EventCard and ProfileCard:
 * explorer links, a raw JSON toggle, and web/native client links.
 */
export default function ExplorerPortalMenu({ position, onClose, portalItems, clientItems, showRaw, onToggleRaw }: Props) {
  if (typeof window === 'undefined') return null;

  const renderLink = (item: ExplorerMenuItem, icon: typeof faArrowUpRightFromSquare) => (
    <a
      href={item.href}
      target={item.href.startsWith('http') ? '_blank' : undefined}
      rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="px-3 py-2 hover:bg-[#3a3a3a] flex items-center justify-between"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <span>{item.name}</span>
      <FontAwesomeIcon icon={icon} className="text-gray-400 text-xs" />
    </a>
  );

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onClick={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="absolute z-[9999] w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
        style={{ top: position.top, left: position.left }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <ul className="py-1 text-sm text-gray-200">
          {portalItems.map((item) => (
            <React.Fragment key={item.name}>
              <li>{renderLink(item, faArrowUpRightFromSquare)}</li>
              {item.dividerAfter ? <li className="border-t border-[#3d3d3d] my-1"></li> : null}
            </React.Fragment>
          ))}
          <li className="border-t border-[#3d3d3d] my-1"></li>
          <li>
            <button
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-[#3a3a3a] flex items-center justify-between"
              onClick={(e) => {
                e.stopPropagation();
                onToggleRaw();
                onClose();
              }}
            >
              <span>{showRaw ? 'Hide raw JSON' : 'Show raw JSON'}</span>
              <FontAwesomeIcon icon={faCode} className="text-gray-400 text-xs" />
            </button>
          </li>
          <li className="border-t border-[#3d3d3d] my-1"></li>
          {clientItems.map((item) => (
            <li key={item.name}>
              {renderLink(item, item.name === 'Native App' ? faMobileScreenButton : faArrowUpRightFromSquare)}
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body
  );
}
