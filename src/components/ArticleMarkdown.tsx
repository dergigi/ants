'use client';

/* eslint-disable @next/next/no-img-element */

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkNostrLinks from '@/lib/remarkNostrLinks';
import NostrProfileLink from '@/components/NostrProfileLink';

interface ArticleMarkdownProps {
  content: string;
}

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function withoutNode<T extends object>(props: T): T {
  const domProps = { ...props } as T & { node?: unknown };
  delete domProps.node;
  return domProps;
}

/**
 * Renders markdown content for NIP-23 long-form articles.
 * Sanitizes links to open in new tabs and styles elements to match the app theme.
 */
export default function ArticleMarkdown({ content }: ArticleMarkdownProps) {
  const scrollToHash = (href: string) => {
    const targetId = decodeURIComponent(href.slice(1));
    const target = document.getElementById(targetId);
    if (!target) return;

    window.history.replaceState(null, '', href);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="article-markdown prose prose-invert prose-sm max-w-none">
      <Markdown
        remarkPlugins={[remarkGfm, remarkNostrLinks]}
        components={{
          a: ({ href, title, children, className, ...props }) => {
            const isProfile = href?.startsWith('/p/');
            if (isProfile && title && href) {
              return <NostrProfileLink token={title} href={href} />;
            }
            const isHashLink = href?.startsWith('#');
            const isInternal = href?.startsWith('/') || isHashLink;
            return (
              <a
                {...withoutNode(props)}
                href={href}
                target={isInternal ? undefined : '_blank'}
                rel={isInternal ? undefined : 'noopener noreferrer'}
                className={joinClasses(
                  'text-blue-400 hover:text-blue-300 hover:underline',
                  className,
                )}
                onClick={isHashLink && href ? (e) => {
                  e.preventDefault();
                  scrollToHash(href);
                } : undefined}
              >
                {children}
              </a>
            );
          },
          h1: ({ children, className, ...props }) => (
            <h1 {...withoutNode(props)} className={joinClasses('text-xl font-bold text-gray-100 mt-4 mb-2', className)}>{children}</h1>
          ),
          h2: ({ children, className, ...props }) => (
            <h2 {...withoutNode(props)} className={joinClasses('text-lg font-semibold text-gray-100 mt-3 mb-2', className)}>{children}</h2>
          ),
          h3: ({ children, className, ...props }) => (
            <h3 {...withoutNode(props)} className={joinClasses('text-base font-semibold text-gray-200 mt-3 mb-1', className)}>{children}</h3>
          ),
          p: ({ children, className, ...props }) => (
            <p {...withoutNode(props)} className={joinClasses('text-gray-100 mb-2 leading-relaxed', className)}>{children}</p>
          ),
          ul: ({ children, className, ...props }) => (
            <ul {...withoutNode(props)} className={joinClasses('list-disc list-inside text-gray-100 mb-2 space-y-1', className)}>{children}</ul>
          ),
          ol: ({ children, className, ...props }) => (
            <ol {...withoutNode(props)} className={joinClasses('list-decimal list-inside text-gray-100 mb-2 space-y-1', className)}>{children}</ol>
          ),
          li: ({ children, className, ...props }) => (
            <li {...withoutNode(props)} className={joinClasses('text-gray-100', className)}>{children}</li>
          ),
          blockquote: ({ children, className, ...props }) => (
            <blockquote {...withoutNode(props)} className={joinClasses('border-l-2 border-gray-500 pl-3 my-2 text-gray-300 italic', className)}>
              {children}
            </blockquote>
          ),
          code: ({ children, className, ...props }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <pre className="bg-[#1a1a1a] rounded p-3 my-2 overflow-x-auto">
                  <code {...withoutNode(props)} className={joinClasses('text-sm text-gray-200', className)}>{children}</code>
                </pre>
              );
            }
            return (
              <code {...withoutNode(props)} className={joinClasses('bg-[#1a1a1a] text-gray-200 px-1 py-0.5 rounded text-sm', className)}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          hr: ({ className, ...props }) => <hr {...withoutNode(props)} className={joinClasses('border-[#3d3d3d] my-3', className)} />,
          img: ({ src, alt, className, ...props }) => (
            <img
              {...withoutNode(props)}
              src={src}
              alt={alt || ''}
              className={joinClasses('max-w-full rounded my-2', className)}
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
