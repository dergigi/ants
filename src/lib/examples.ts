// Search examples that we'll randomly select from and test
export const searchExamples = [
  // Basic
  'vibe coding',
  '#PenisButter',
  '#YESTR',
  '#SovEng',
  '#News',
  'nevent',
  
  // Author
  'by:dergigi',
  'by:gigi',
  'by:pablo',
  'by:corndalorian',

  // Combined
  'GM by:dergigi',
  '#YESTR by:dergigi',
  '👀 by:dergigi',
  'NIP-EE by:jeffg',
  '.jpg by:corndalorian',
  'site:github by:fiatjaf',
  'by:dergigi site:yt',
  '#news site:rumble.com',

  // Direct npub
  'GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',

  // Profile lookup / NIP-05
  'p:fiatjaf',
  'p:hodl',
  'p:dergigi.com',
  '@dergigi.com',

  // Operators & media
  'bitcoin OR lightning',
  'https://dergigi.com/vew',
  'has:image',
  'is:image',
  'has:video',
  'is:video',
  'has:gif',
  'is:gif',
  // Mixed media + text
  'GM has:video',
  'Bitcoin has:image',
  'meme has:gif',
  'by:dergigi has:image',
  'by:HODL has:video',
  'Gregzaj1-ln_strike.gif',
  'giphy.gif',
  'by:gregzaj has:gif',
  '(GM OR GN) by:dergigi has:image',

  // Kinds filter examples
  'is:muted by:fiatjaf',
  'is:zap by:marty',
  'is:bookmark by:hzrd',
  'is:file',

  // Relay filters (removed)

  // NIP-50 extensions
  'bitcoin include:spam',
] as const;

// Examples that require login to work properly
const loginRequiredExamples = [] as const;

// Get examples filtered by login status
export function getFilteredExamples(isLoggedIn: boolean): readonly string[] {
  if (isLoggedIn) {
    return searchExamples;
  }
  
  // Filter out login-required examples
  return searchExamples.filter(example => 
    !(loginRequiredExamples as readonly string[]).includes(example)
  );
}

// Helper type for type safety
export type SearchExample = typeof searchExamples[number]; 