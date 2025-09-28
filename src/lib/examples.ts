// Search examples that we'll randomly select from and test
export const searchExamples = [
  // Basic
  'vibe coding',
  'nicolas-cage.gif',
  '#PenisButter',
  '#YESTR',
  '#SovEng',
  '#gratefulchain',
  '#photography',
  '#artstr',
  'nevent',
  'habla.news',
  
  // Author
  'by:dergigi',
  'by:gigi',
  'by:pablof7z',
  'by:corndalorian',

  // Combined
  'GM by:dergigi',
  'GM fiat by:fiatjaf',
  'good by:socrates',
  '#YESTR by:dergigi',
  '👀 by:dergigi',
  'NIP-EE by:jeffg',
  '.jpg by:corndalorian',
  'site:github by:fiatjaf',
  'by:dergigi site:yt',
  '#news site:rumble.com',
  'by:rektbot 💀💀💀💀💀💀💀💀💀💀',
  '"car crash" by:dergigi',
  '(PoW OR WoT) by:dergigi',
  'free by:ulbricht',
  '(nostr OR 🫂) by:snowden',
  '"GM PV" by:derek',

  // Direct npub
  'GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',
  'proof-of-work by:npub1satsv3728d65nenvkmzthrge0aduj8088dvwkxk70rydm407cl4s87sfhu',

  // Profile lookup / NIP-05
  'p:fiatjaf',
  'p:hodl',
  'p:dergigi.com',
  '@dergigi.com',
  'p:zaps.lol',
  'p:nostrplebs.com',
  'p:dave',
  'p:NewsBot or p:RSS',
  'p:twentyone.world',
  'einundzwanzig or twentyone.world',
  'kind:0 #bitcoin',
  '(p:dad OR p:husband OR p:father)',

  // Operators & media
  'bitcoin OR lightning',
  'https://dergigi.com/vew',
  'has:image',
  'is:image',
  'has:image OR is:image',
  'has:video',
  'is:video',
  'has:gif',
  '"habla.news"',

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
  'is:image #Olas365',
  'PressReader by:Bouma',
  '#runstr OR #plebwalk OR by:bitcoinwalk',
  'PV or 🤙',
  '🧘‍♀️ or 🧘‍♂️ or 🧘 or 💆 ',
  '😂 or 🤣 or lol or lmao',
  'Liotta .gif',
  '#plebchain or #introductions',

  // Kinds filter examples
  'is:muted by:fiatjaf',
  'is:zap by:marty',
  'is:bookmark by:hzrd',
  'is:file',
  'is:repost by:dor',
  'is:muted by:carvalho',
  'is:highlight',

  // Multiple Authors
  'NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)',

  // Multiple hashtags
  '#dogstr or #pugstr or #horsestr or #goatstr',

  // NIP-50 extensions
  'bitcoin include:spam',
  'nip:03',

  // Highlight examples
  'is:highlight (bitcoin OR nostr)',
  'is:highlight by:dergigi',
  'is:highlight by:fiatjaf',
  'is:highlight by:pablof7z',
  'is:highlight "proof of work"',

  // Slash Commands
  '/help',
  '/examples',
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