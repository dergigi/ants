'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import CopyButton from '@/components/CopyButton';

type Props = {
  event: NDKEvent;
  className?: string;
};

function extractLanguageFromTags(event: NDKEvent): string | null {
  // Try common tag forms: ['lang', 'javascript'], ['language', 'ts'], ['m', 'file.ts']
  const tags = Array.isArray(event.tags) ? event.tags : [];
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    const [k, v] = tag;
    const key = typeof k === 'string' ? k.toLowerCase() : '';
    const val = typeof v === 'string' ? v : '';
    if (key === 'lang' || key === 'language') return val;
    if (key === 'm') {
      // Try to infer language from filename extension
      const dot = val.lastIndexOf('.');
      if (dot > -1 && dot < val.length - 1) return val.slice(dot + 1);
    }
  }
  return null;
}

export default function CodeSnippet({ event, className }: Props) {
  const code = event?.content || '';
  const rawLanguage = extractLanguageFromTags(event) || '';
  const language = rawLanguage.trim().toLowerCase();

  const headerRight = (
    <CopyButton text={code} title="Copy code" />
  );

  return (
    <div className={className || ''}>
      <div className="text-xs text-gray-300 mb-2 flex items-center justify-between">
        <span className="font-semibold">{language ? `code:${language}` : 'code'}</span>
        {headerRight}
      </div>
      <Highlight code={code} language={(language as any) || 'tsx'} theme={themes.nightOwl}>
        {({ className: cls, style, tokens, getLineProps, getTokenProps }: RenderProps) => (
          <pre
            className={`${cls} text-sm overflow-x-auto rounded-md p-3 bg-[#1f1f1f] border border-[#3d3d3d]`.trim()}
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


