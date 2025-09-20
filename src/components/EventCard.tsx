'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCode } from '@fortawesome/free-solid-svg-icons';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createEventExplorerItems } from '@/lib/portals';
import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import { connect, safeSubscribe } from '@/lib/ndk';

type Props = {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  renderContent: (content: string) => React.ReactNode;
  variant?: 'card' | 'inline';
  mediaRenderer?: (content: string) => React.ReactNode;
  footerRight?: React.ReactNode;
  className?: string;
  showFooter?: boolean;
};

// No local media helpers; media should be rendered by the provided mediaRenderer prop to keep this component generic.

export default function EventCard({ event, onAuthorClick, renderContent, variant = 'card', mediaRenderer, footerRight, className, showFooter = true }: Props) {
  const baseContainerClasses = variant === 'inline'
    ? 'flex w-full max-w-full flex-col gap-1 px-3 py-2 rounded-md bg-[#1f1f1f] border border-[#3d3d3d]'
    : 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg';
  const containerClasses = className ? `${baseContainerClasses} ${className}` : baseContainerClasses;

  const contentClasses = variant === 'inline'
    ? 'text-gray-100 whitespace-pre-wrap break-words'
    : 'text-gray-100 whitespace-pre-wrap break-words';

  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const portalButtonRef = useRef<HTMLButtonElement>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawEvent, setRawEvent] = useState<NDKEvent | null>(null);

  return (
    <div className={containerClasses}>
      <div className={contentClasses}>{renderContent(event.content || '')}</div>
      {variant !== 'inline' && mediaRenderer ? mediaRenderer(event.content || '') : null}
      {showFooter && (
        <div className={variant === 'inline' ? 'text-xs text-gray-300 pt-1 border-t border-[#3d3d3d] flex items-center justify-between gap-2' : 'mt-4 text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] -mx-4 -mb-4 px-4 py-2 flex items-center justify-between gap-2 flex-wrap rounded-b-lg'}>
          <div className="flex items-center gap-2">
            <AuthorBadge user={event.author} onAuthorClick={onAuthorClick} />
          </div>
          {footerRight ? (
            <div className="flex items-center gap-2">
              {footerRight}
              {event?.id ? (
                <>
                  <button
                    ref={portalButtonRef}
                    type="button"
                    aria-label="Open in portals"
                    title="Open in portals"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (portalButtonRef.current) {
                        const rect = portalButtonRef.current.getBoundingClientRect();
                        setMenuPosition({ top: rect.bottom + 4, left: rect.left });
                      }
                      setShowPortalMenu((v) => !v);
                    }}
                    className="w-5 h-5 rounded-md text-gray-300 flex items-center justify-center text-[12px] leading-none hover:bg-[#3a3a3a]"
                  >
                    ⋯
                  </button>
                  <button
                    type="button"
                    aria-label="Show raw event"
                    title="Show raw event"
                    className="w-5 h-5 rounded-md text-gray-300 flex items-center justify-center hover:bg-[#3a3a3a]"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const id = event.id;
                      if (!id) { setShowRaw(true); setRawEvent(null); return; }
                      setShowRaw(true);
                      setRawLoading(true);
                      setRawEvent(null);
                      try {
                        try { await connect(); } catch {}
                        const sub = safeSubscribe([{ ids: [id] }], { closeOnEose: true });
                        if (!sub) { setRawLoading(false); return; }
                        const timer = setTimeout(() => { try { sub.stop(); } catch {}; setRawLoading(false); }, 8000);
                        sub.on('event', (evt: NDKEvent) => { setRawEvent(evt); });
                        sub.on('eose', () => { clearTimeout(timer); try { sub.stop(); } catch {}; setRawLoading(false); });
                        sub.start();
                      } catch {
                        setRawLoading(false);
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faCode} className="text-gray-400 text-xs" />
                  </button>
                  <a
                    href={`nostr:${nip19.neventEncode({ id: event.id })}`}
                    title="Open in native client"
                    className="text-gray-400 hover:text-gray-200"
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {showPortalMenu && typeof window !== 'undefined' && event?.id && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => { e.preventDefault(); setShowPortalMenu(false); }}
          />
          <div
            className="fixed z-[9999] w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <ul className="py-1 text-sm text-gray-200">
              {(() => {
                const nevent = nip19.neventEncode({ id: event.id });
                const items = createEventExplorerItems(nevent);
                return items.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      target={item.href.startsWith('http') ? '_blank' : undefined}
                      rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="block px-3 py-2 hover:bg-[#3a3a3a] flex items-center justify-between"
                      onClick={(e) => { e.stopPropagation(); setShowPortalMenu(false); }}
                    >
                      <span>{item.name}</span>
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-gray-400 text-xs" />
                    </a>
                  </li>
                ));
              })()}
            </ul>
          </div>
        </>,
        document.body
      )}
      {showRaw && typeof window !== 'undefined' && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/40"
            onClick={(e) => { e.preventDefault(); setShowRaw(false); }}
          />
          <div
            className="fixed z-[9999] max-w-2xl w-[90vw] max-h-[70vh] overflow-auto rounded-md bg-[#1f1f1f] border border-[#3d3d3d] shadow-lg p-3"
            style={{ top: '15vh', left: '50%', transform: 'translateX(-50%)' }}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-300">Raw event</div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-200"
                onClick={() => setShowRaw(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="text-xs text-gray-200">
              {rawLoading ? (
                <div>Loading…</div>
              ) : rawEvent ? (
                <Highlight
                  code={JSON.stringify({
                    id: rawEvent.id,
                    kind: rawEvent.kind,
                    created_at: rawEvent.created_at,
                    pubkey: rawEvent.pubkey,
                    content: rawEvent.content,
                    tags: rawEvent.tags,
                    sig: rawEvent.sig
                  }, null, 2)}
                  language="json"
                  theme={themes.nightOwl}
                >
                  {({ className, style, tokens, getLineProps, getTokenProps }: RenderProps) => (
                    <pre className={`${className} overflow-x-auto rounded-md p-3 bg-[#1f1f1f] border border-[#3d3d3d]`} style={{ ...style, background: 'transparent', whiteSpace: 'pre' }}>
                      {tokens.map((line, i: number) => (
                        <div key={i} {...getLineProps({ line })}>
                          {line.map((token, key: number) => (
                            <span key={key} {...getTokenProps({ token })} />
                          ))}
                        </div>
                      ))}
                    </pre>
                  )}
                </Highlight>
              ) : (
                <div className="text-gray-400">No event available</div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}


