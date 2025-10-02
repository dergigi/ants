'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import { toPlainEvent } from '@/lib/toPlainEvent';
import CopyButton from '@/components/CopyButton';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

type Props = {
  event: NDKEvent | null | undefined;
  loading?: boolean;
  className?: string;
  title?: string;
  parseContent?: boolean;
};

export default function RawEventJson({ event, loading = false, className, title, parseContent = true }: Props) {
  if (loading) return <div className={`text-xs text-gray-400 flex items-center gap-1 ${className || ''}`.trim()}>
    <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
    Loading…
  </div>;
  if (!event) return <div className={`text-xs text-gray-400 ${className || ''}`.trim()}>No event available</div>;

  const base = toPlainEvent(event) as Record<string, unknown>;
  const data: Record<string, unknown> = { ...base };
  try {
    if (parseContent) {
      const raw = data.content;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          data.content = JSON.parse(trimmed);
        }
      }
    }
  } catch {}
  const json = JSON.stringify(data, null, 2);

  return (
    <div>
      {(() => {
        const headerTitle = typeof title === 'string' ? title : (typeof event?.kind === 'number' ? `kind:${event.kind}` : null);
        return headerTitle ? (
        <div className="text-xs text-gray-300 mb-2 flex items-center justify-between">
          <span className="font-semibold">{headerTitle}</span>
          <CopyButton text={json} title="Copy JSON" />
        </div>
        ) : null;
      })()}
      <Highlight code={json} language="json" theme={themes.nightOwl}>
        {({ className: cls, style, tokens, getLineProps, getTokenProps }: RenderProps) => (
          <pre
            className={`${cls} text-xs overflow-x-auto rounded-md p-3 bg-[#1f1f1f] border border-[#3d3d3d] ${className || ''}`.trim()}
            style={{ ...style, background: 'transparent', whiteSpace: 'pre' }}
          >
            {tokens.map((line, i) => (
              <div key={`l-${i}`} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={`t-${i}-${key}`} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}


