'use client';

import Markdown from 'react-markdown';
import remarkNostrLinks from '@/lib/remarkNostrLinks';

interface ArticleMarkdownProps {
  content: string;
}

/**
 * Renders markdown content for NIP-23 long-form articles.
 * Sanitizes links to open in new tabs and styles elements to match the app theme.
 */
export default function ArticleMarkdown({ content }: ArticleMarkdownProps) {
  return (
    <div className="article-markdown prose prose-invert prose-sm max-w-none">
      <Markdown
        remarkPlugins={[remarkNostrLinks]}
        components={{
          a: ({ href, children }) => {
            const isInternal = href?.startsWith('/');
            return (
              <a
                href={href}
                target={isInternal ? undefined : '_blank'}
                rel={isInternal ? undefined : 'noopener noreferrer'}
                className="text-blue-400 hover:text-blue-300 hover:underline"
              >
                {children}
              </a>
            );
          },
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-gray-100 mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-gray-100 mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-gray-200 mt-3 mb-1">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-gray-100 mb-2 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside text-gray-100 mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside text-gray-100 mb-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-gray-100">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gray-500 pl-3 my-2 text-gray-300 italic">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <pre className="bg-[#1a1a1a] rounded p-3 my-2 overflow-x-auto">
                  <code className="text-sm text-gray-200">{children}</code>
                </pre>
              );
            }
            return (
              <code className="bg-[#1a1a1a] text-gray-200 px-1 py-0.5 rounded text-sm">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          hr: () => <hr className="border-[#3d3d3d] my-3" />,
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || ''}
              className="max-w-full rounded my-2"
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
