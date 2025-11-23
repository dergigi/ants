import { clearRelayCaches } from './relays';
import { clearAllProfileCaches } from './profile/cache';

export interface SlashCommand {
  key: string;
  label: string;
  description: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { key: 'help', label: '/help', description: 'Show this help' },
  { key: 'examples', label: '/examples', description: 'List example queries' },
  { key: 'login', label: '/login', description: 'Connect with NIP-07' },
  { key: 'logout', label: '/logout', description: 'Clear session' },
  { key: 'clear', label: '/clear', description: 'Clear all caches' },
  { key: 'tutorial', label: '/tutorial', description: 'Show tutorial video' },
  { key: 'kinds', label: '/kinds', description: 'List is: shortcuts that map to nostr kinds' }
] as const;

export interface SlashCommandHandlers {
  onHelp: (commands: readonly SlashCommand[]) => void;
  onExamples: () => void;
  onLogin: () => Promise<void>;
  onLogout: () => void;
  onClear: () => Promise<void>;
  onTutorial: () => void;
  onKinds: () => Promise<void>;
}

export function createSlashCommandRunner(handlers: SlashCommandHandlers) {
  return (rawInput: string) => {
    const cmd = rawInput.replace(/^\s*\//, '').trim().toLowerCase();
    
    if (cmd === 'help') {
      handlers.onHelp(SLASH_COMMANDS);
      return;
    }
    
    if (cmd === 'examples') {
      handlers.onExamples();
      return;
    }
    
    if (cmd === 'login') {
      handlers.onLogin();
      return;
    }
    
    if (cmd === 'logout') {
      handlers.onLogout();
      return;
    }
    
    if (cmd === 'clear') {
      handlers.onClear();
      return;
    }
    
    if (cmd === 'tutorial') {
      handlers.onTutorial();
      return;
    }
    
    if (cmd === 'kinds') {
      handlers.onKinds();
      return;
    }
    
    // Unknown command
    return cmd;
  };
}

export async function executeClearCommand(): Promise<void> {
  try {
    clearRelayCaches();
    clearAllProfileCaches();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ants_nip50_support_cache');
      localStorage.removeItem('ants_nip50_cache');
      localStorage.removeItem('ants_relay_info_cache');
    }
  } catch (error) {
    throw new Error(`Cache clearing failed: ${error}`);
  }
}
