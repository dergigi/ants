'use client';

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { createSlashCommandRunner, executeClearCommand, type SlashCommand } from '@/lib/slashCommands';
import { getIsKindRules } from '@/lib/search/replacements';
import { getFilteredExamples } from '@/lib/examples';
import { isLoggedIn, login, logout } from '@/lib/nip07';
import { nextExample } from '@/lib/ndk';
import { updateSearchQuery } from '@/lib/utils/navigationUtils';
import { buildCli } from '@/lib/utils/searchViewUtils';
import { useLoginTrigger } from '@/lib/LoginTrigger';

/**
 * Slash command state and runner: the CLI-style command card content
 * plus the login/logout/clear/kinds command handlers.
 */
export function useSlashCommands(options: {
  setQuery: (q: string) => void;
  setResults: Dispatch<SetStateAction<NDKEvent[]>>;
  setPlaceholder: (p: string) => void;
}) {
  const { setQuery, setResults, setPlaceholder } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [topCommandText, setTopCommandText] = useState<string | null>(null);
  const [topExamples, setTopExamples] = useState<string[] | null>(null);
  const [helpCommands, setHelpCommands] = useState<readonly SlashCommand[] | null>(null);
  const [kindsRules, setKindsRules] = useState<Array<{ token: string; expansion: string }> | null>(null);
  const [kindsLoading, setKindsLoading] = useState(false);
  const [kindsError, setKindsError] = useState<string | null>(null);
  const { triggerLogin, onLoginTrigger, setLoginState, setCurrentUser } = useLoginTrigger();

  const runSlashCommand = useMemo(() => createSlashCommandRunner({
    onHelp: (commands) => {
      const lines = [
        'Available commands:',
        ...commands.map(c => `  ${c.label.padEnd(12)} ${c.description}`)
      ];
      setTopCommandText(buildCli('--help', lines));
      setHelpCommands(commands);
      setTopExamples(null);
      setKindsRules(null);
    },
    onExamples: () => {
      const examples = getFilteredExamples(isLoggedIn());
      setTopExamples(Array.from(examples));
      setTopCommandText(buildCli('--help examples'));
      setHelpCommands(null);
      setKindsRules(null);
    },
    onLogin: async () => {
      setLoginState('logging-in');
      setTopCommandText(buildCli('login', 'Attempting login…'));
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
      try {
        const user = await login();
        if (user) {
          // Immediately set current user and logged-in state for instant header update
          setCurrentUser(user);
          setLoginState('logged-in');
          const userDisplay = user.profile?.nip05 || user.profile?.displayName || user.profile?.name || user.npub;
          setTopCommandText(buildCli('login', `Logged in as ${userDisplay}`));
          setPlaceholder(nextExample());

          // Fetch profile in the background to avoid blocking header update
          (async () => {
            try {
              await user.fetchProfile();
              // Clone user to ensure state change triggers re-render with updated profile
              const cloned = new NDKUser({ pubkey: user.pubkey });
              cloned.ndk = user.ndk;
              if (user.profile) {
                cloned.profile = { ...(user.profile as Record<string, unknown>) } as typeof user.profile;
              }
              setCurrentUser(cloned);
              // Update login message with fetched profile info
              const updatedDisplay = cloned.profile?.nip05 || cloned.profile?.displayName || cloned.profile?.name || cloned.npub;
              setTopCommandText(buildCli('login', `Logged in as ${updatedDisplay}`));
            } catch {}
          })();
        } else {
          setCurrentUser(null);
          setLoginState('logged-out');
          setTopCommandText(buildCli('login', 'Login cancelled'));
        }
      } catch {
        setCurrentUser(null);
        setLoginState('logged-out');
        setTopCommandText(buildCli('login', 'Login failed. Ensure a NIP-07 extension is installed.'));
      }
    },
    onLogout: () => {
      try {
        logout();
        setCurrentUser(null);
        setLoginState('logged-out');
        setTopCommandText(buildCli('logout', 'Logged out'));
        setPlaceholder(nextExample());
      } catch {
        setTopCommandText(buildCli('logout', 'Logout failed'));
      }
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
    },
    onClear: async () => {
      setTopCommandText(buildCli('clear --cache', 'Clearing all caches...'));
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
      try {
        await executeClearCommand();
        setTopCommandText(buildCli('clear --cache', 'All caches cleared successfully'));
      } catch (error) {
        setTopCommandText(buildCli('clear --cache', `Cache clearing failed: ${error}`));
      }
    },
    onTutorial: () => {
      const tutorialNevent = 'nevent1qqsqnndhkz4u26m4v4gut2xjsun8hzfxn75spzcr8337a06g66zwzespzamhxue69uhksctkv4hzuer9wfnkjemf9e3k7mgehz685';
      setTopCommandText(buildCli('--help tutorial', 'Loading tutorial event...'));
      setTopExamples(null);
      setHelpCommands(null);
      setKindsRules(null);
      setQuery(tutorialNevent);
      updateSearchQuery(searchParams, router, tutorialNevent);
    },
    onKinds: async () => {
      setTopCommandText(buildCli('kinds', 'Loading kind shortcuts...'));
      setTopExamples(null);
      setHelpCommands(null);
      setResults([]);
      setKindsLoading(true);
      setKindsError(null);
      try {
        const rules = await getIsKindRules();
        setKindsRules(rules.map(r => ({ token: r.token, expansion: r.expansion })));
        setTopCommandText(buildCli('kinds', `${rules.length} is: shortcuts that map to nostr kinds`));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to load kind shortcuts';
        setKindsError(errorMsg);
        setTopCommandText(buildCli('kinds', `Error: ${errorMsg}`));
      } finally {
        setKindsLoading(false);
      }
    }
  }), [setTopCommandText, setPlaceholder, setTopExamples, setLoginState, setCurrentUser, setQuery, setResults, searchParams, router]);

  return {
    runSlashCommand,
    topCommandText,
    setTopCommandText,
    topExamples,
    setTopExamples,
    helpCommands,
    kindsRules,
    setKindsRules,
    kindsLoading,
    kindsError,
    triggerLogin,
    onLoginTrigger
  };
}
