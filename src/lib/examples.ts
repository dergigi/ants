// Search examples that we'll randomly select from and test
export const searchExamples = [
  // Sorted by length (shortest to longest)
  'p:dave',
  'nip:03',
  '/help',
  'is:file',
  'p:hodl',
  'is:video',
  'is:image',
  'has:gif',
  'has:video',
  'has:image',
  'is:highlight',
  'by:gigi',
  'nevent',
  '/examples',
  'p:fiatjaf',
  'good by:socrates',
  'GM by:dergigi',
  '👀 by:dergigi',
  'NIP-EE by:jeffg',
  'free by:ulbricht',
  'PV or 🤙',
  'giphy.gif',
  'Liotta .gif',
  'p:zaps.lol',
  'p:dergigi.com',
  '@dergigi.com',
  'p:nostrplebs.com',
  'p:twentyone.world',
  'p:NewsBot or p:RSS',
  'kind:0 #bitcoin',
  'bitcoin include:spam',
  'vibe coding',
  'nicolas-cage.gif',
  '#PenisButter',
  '#YESTR',
  '#SovEng',
  '#gratefulchain',
  'habla.news',
  'by:dergigi',
  'by:pablof7z',
  'by:corndalorian',
  'GM fiat by:fiatjaf',
  '#YESTR by:dergigi',
  '.jpg by:corndalorian',
  'site:github by:fiatjaf',
  'by:dergigi site:yt',
  '#news site:rumble.com',
  'by:rektbot 💀💀💀💀💀💀💀💀💀💀',
  '"car crash" by:dergigi',
  '(PoW OR WoT) by:dergigi',
  '(nostr OR 🫂) by:snowden',
  '"GM PV" by:derek',
  'bitcoin OR lightning',
  'https://dergigi.com/vew',
  'has:image OR is:image',
  '"habla.news"',
  'GM has:video',
  'Bitcoin has:image',
  'meme has:gif',
  'by:dergigi has:image',
  'by:HODL has:video',
  'Gregzaj1-ln_strike.gif',
  'by:gregzaj has:gif',
  'is:image #Olas365',
  'PressReader by:Bouma',
  '#runstr OR #plebwalk OR by:bitcoinwalk',
  '🧘‍♀️ or 🧘‍♂️ or 🧘 or 💆 ',
  '😂 or 🤣 or lol or lmao',
  '#plebchain or #introductions',
  'is:muted by:fiatjaf',
  'is:zap by:marty',
  'is:bookmark by:hzrd',
  'is:repost by:dor',
  'is:muted by:carvalho',
  'einundzwanzig or twentyone.world',
  '(p:dad OR p:husband OR p:father)',
  'is:highlight by:dergigi',
  'is:highlight by:fiatjaf',
  'is:highlight by:pablof7z',
  'is:highlight "proof of work"',
  '(GM OR GN) by:dergigi has:image',
  'NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)',
  'is:highlight (bitcoin OR nostr)',
  '#dogstr or #pugstr or #catstr or #horsestr or #goatstr',
  'GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',
  'proof-of-work by:npub1satsv3728d65nenvkmzthrge0aduj8088dvwkxk70rydm407cl4s87sfhu',
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