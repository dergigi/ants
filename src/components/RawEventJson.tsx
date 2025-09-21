'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import { toPlainEvent } from '@/lib/toPlainEvent';

type Props = {
  event: NDKEvent | null | undefined;
  loading?: boolean;
  className?: string;
};

export default function RawEventJson({ event, loading = false, className }: Props) {
  if (loading) return <div className={`text-xs text-gray-400 ${className || ''}`.trim()}>Loading…</div>;
  if (!event) return <div className={`text-xs text-gray-400 ${className || ''}`.trim()}>No event available</div>;

  const json = JSON.stringify(toPlainEvent(event), null, 2);

  return (
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
  );
}


