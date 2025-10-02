'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useEffect, useState } from 'react';
import { Highlight, themes, type RenderProps, type Language } from 'prism-react-renderer';
import CopyButton from '@/components/CopyButton';
import IconButton from '@/components/IconButton';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScaleBalanced, faCodeBranch } from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { ensureBashLanguage, ensureLanguage } from '@/lib/prism';

type Props = {
  event: NDKEvent;
  className?: string;
  onSearch?: (query: string) => void;
};

function extractLanguageFromTags(event: NDKEvent): string | null {
  // Try common tag forms: ['lang', 'javascript'], ['language', 'ts'], ['m', 'file.ts']
  const tags = Array.isArray(event.tags) ? event.tags : [];
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    const [k, v] = tag;
    const key = typeof k === 'string' ? k.toLowerCase() : '';
    const val = typeof v === 'string' ? v : '';
    if (key === 'l') return val; // shorthand for language
    if (key === 'lang' || key === 'language') return val;
    if (key === 'm') {
      // Try to infer language from filename extension
      const dot = val.lastIndexOf('.');
      if (dot > -1 && dot < val.length - 1) return val.slice(dot + 1);
    }
    if (key === 'extension') return val;
  }
  return null;
}

export default function CodeSnippet({ event, className, onSearch }: Props) {
  const code = event?.content || '';
  const rawLanguage = extractLanguageFromTags(event) || '';
  const language = rawLanguage.trim().toLowerCase();
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const normalizedLanguage = (language === 'sh' || language === 'shell') ? 'bash' : language;
  const [langReady, setLangReady] = useState(false);

  // Ensure bash is available when requested
  useEffect(() => {
    let cancelled = false;
    setLangReady(false);
    (async () => {
      try {
        if (normalizedLanguage) {
          if (normalizedLanguage === 'bash') ensureBashLanguage();
          await ensureLanguage(normalizedLanguage);
        }
      } finally {
        if (!cancelled) setLangReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [normalizedLanguage]);

  const getTagValue = (keys: string[]): string | null => {
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) continue;
      const [k, v] = tag;
      const key = typeof k === 'string' ? k.toLowerCase() : '';
      if (keys.includes(key) && typeof v === 'string' && v) return v;
    }
    return null;
  };

  // filename currently shown in header only
  const description = getTagValue(['description', 'desc']) || null;
  const license = getTagValue(['license']) || null;
  const repoUrl = getTagValue(['repo']) || null;

  const headerRight = (
    <div className="flex items-center gap-2">
      {license ? (
        <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-[#262626] border border-[#3d3d3d] text-[10px] uppercase tracking-wide gap-1" title={`License: ${license}`}>
          <FontAwesomeIcon icon={faScaleBalanced} className="text-xs" />
          {license}
        </span>
      ) : null}
      {repoUrl ? (
        <IconButton
          title="Search repository"
          onClick={() => onSearch && onSearch(repoUrl)}
          className="border border-[#3d3d3d]"
        >
          {(() => {
            let isGithub = false;
            try {
              const u = new URL(repoUrl);
              isGithub = /(^|\.)github\.com$/i.test(u.hostname);
            } catch {
              isGithub = /github\.com/i.test(repoUrl);
            }
            return (
              <FontAwesomeIcon icon={isGithub ? faGithub : faCodeBranch} className="text-xs" />
            );
          })()}
        </IconButton>
      ) : null}
      <CopyButton text={code} title="Copy code" />
    </div>
  );

  return (
    <div className={className || ''}>
      <div className="text-xs text-gray-300 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">
            {language ? `code:${language}` : 'code'}
          </span>
        </div>
        {headerRight}
      </div>
      {description ? (
        <div className="text-gray-100 whitespace-pre-wrap break-words mb-2" title={description}>
          {description}
        </div>
      ) : null}
      {(normalizedLanguage ? langReady : true) ? (
      <Highlight code={code} language={(normalizedLanguage || 'tsx') as Language} theme={themes.nightOwl}>
        {({ className: cls, style, tokens, getLineProps, getTokenProps }: RenderProps) => (
          <pre
            className={`${cls} text-sm overflow-x-auto rounded-md p-3 bg-black border border-[#3d3d3d]`.trim()}
            style={{ ...style, whiteSpace: 'pre' }}
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
      ) : (
        <pre className="text-sm overflow-x-auto rounded-md p-3 bg-black border border-[#3d3d3d] text-gray-100 whitespace-pre-wrap break-words">
          {code}
        </pre>
      )}
      {(() => {
        const values = new Set<string>();
        for (const tag of tags) {
          if (!Array.isArray(tag) || tag.length < 2) continue;
          const [k, v] = tag;
          const key = typeof k === 'string' ? k.toLowerCase() : '';
          const val = typeof v === 'string' ? v.trim() : '';
          if ((key === 't' || key === '#') && val) {
            values.add(val);
          }
        }
        if (values.size === 0) return null;
        return (
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(values).map((t) => (
              <button
                key={`hash-${t}`}
                type="button"
                className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer text-xs"
                onClick={() => onSearch && onSearch(`is:code #${t}`)}
                title={`Search: is:code #${t}`}
              >
                #{t}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}


