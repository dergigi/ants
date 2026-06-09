'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { Highlight, themes, type RenderProps } from 'prism-react-renderer';
import { ndk } from '@/lib/ndk';
import { type SlashCommand } from '@/lib/slashCommands';
import EventCard from '@/components/EventCard';
import packageJson from '../../package.json';

type Props = {
  topCommandText: string;
  helpCommands: readonly SlashCommand[] | null;
  topExamples: string[] | null;
  kindsRules: Array<{ token: string; expansion: string }> | null;
  kindsLoading: boolean;
  kindsError: string | null;
  onSearch: (query: string) => void;
  onAuthorClick: (npub: string, prefetchEvent?: NDKEvent) => void;
};

/** CLI-style card shown at the top of the results for slash commands */
export default function SearchCommandCard({ topCommandText, helpCommands, topExamples, kindsRules, kindsLoading, kindsError, onSearch, onAuthorClick }: Props) {
  return (
    <EventCard
      event={new NDKEvent(ndk)}
      onAuthorClick={onAuthorClick}
      renderContent={() => (
        <Highlight code={topCommandText} language="bash" theme={themes.nightOwl}>
          {({ className: cls, style, tokens, getLineProps, getTokenProps }: RenderProps) => (
            <pre
              className={`${cls} text-xs overflow-x-auto rounded-md p-3 border border-[#3d3d3d]`.trim()}
              style={{ ...style, whiteSpace: 'pre' }}
            >
              {helpCommands && helpCommands.length > 0 ? (
                <>
                  <div>{topCommandText.split('\n')[0]}</div>
                  <div>&nbsp;</div>
                  {helpCommands.map((cmd, idx) => (
                    <div key={`${cmd.key}-${idx}`}>
                      <button
                        type="button"
                        className="text-left w-full hover:underline"
                        onClick={() => onSearch(cmd.label)}
                      >
                        {`${cmd.label.padEnd(12)} ${cmd.description}`}
                      </button>
                    </div>
                  ))}
                  <div>&nbsp;</div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://github.com/dergigi/ants/releases/tag/v${packageJson.version}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      v{packageJson.version}
                    </a>
                    <a
                      href={`https://github.com/dergigi/ants/commit/${process.env.NEXT_PUBLIC_GIT_COMMIT || 'unknown'}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT || 'unknown'}
                    </a>
                  </div>
                </>
              ) : topExamples && topExamples.length > 0 ? (
                <>
                  <div>{topCommandText.split('\n')[0]}</div>
                  <div>&nbsp;</div>
                  {topExamples.map((ex, idx) => (
                    <div key={`${ex}-${idx}`}>
                      <button
                        type="button"
                        className="text-left w-full hover:underline"
                        onClick={() => onSearch(ex)}
                      >
                        {ex}
                      </button>
                    </div>
                  ))}
                </>
              ) : kindsRules && kindsRules.length > 0 ? (
                <>
                  <div>{topCommandText.split('\n')[0]}</div>
                  <div>&nbsp;</div>
                  {kindsRules.map((rule, idx) => (
                    <div key={`${rule.token}-${idx}`}>
                      <button
                        type="button"
                        className="text-left w-full hover:underline"
                        onClick={() => onSearch(rule.token)}
                      >
                        <span className="font-mono">{rule.token.padEnd(16)}</span>
                        <span className="text-gray-400">{' => '}</span>
                        <span className="font-mono text-blue-400">{rule.expansion}</span>
                      </button>
                    </div>
                  ))}
                </>
              ) : kindsLoading ? (
                <>
                  <div>{topCommandText.split('\n')[0]}</div>
                  <div>&nbsp;</div>
                  <div>Loading kind shortcuts...</div>
                </>
              ) : kindsError ? (
                <>
                  <div>{topCommandText.split('\n')[0]}</div>
                  <div>&nbsp;</div>
                  <div className="text-red-400">Error: {kindsError}</div>
                </>
              ) : (
                <>
                  {tokens.map((line, i) => (
                    <div key={`cmd-${i}`} {...getLineProps({ line })}>
                      {line.map((token, key) => (
                        <span key={`cmd-t-${i}-${key}`} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </>
              )}
            </pre>
          )}
        </Highlight>
      )}
      variant="card"
      showFooter={false}
    />
  );
}
