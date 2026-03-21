// Search examples that we'll randomly select from and test
export const searchExamples = [

  // Slash Commands
  '/help',

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
  
  // by:Author
  'by:fiatjaf',
  'by:@dergigi.com',
  'by:gigi',
  'by:pablof7z',
  'by:corndalorian',
  'by:snowden',
  'by:socrates',

  // @me (requires login)
  'by:@me',
  'GM by:@me',
  'mentions:@me',
  'by:@me has:image',

  // Combined
  'GM by:dergigi',
  'GM fiat by:fiatjaf',
  'good by:socrates',
  'engineering by:lyn',
  '≠ by:dergigi.com',
  'stay humble by:odell',
  '#YESTR by:dergigi',
  '👀 by:dergigi',
  'NIP-EE by:jeffg',
  '.jpg by:corndalorian',
  'site:github by:fiatjaf',
  'by:dergigi site:yt',
  'ai site:hn',
  'by:rektbot 💀💀💀💀💀💀💀💀💀💀',
  '"car crash" by:dergigi',
  '(PoW OR WoT) by:dergigi',
  'free by:ulbricht',
  '(nostr OR 🫂) by:snowden',
  '"GM PV" by:derek',
  'free by:ross',
  'freedom by:ulbricht',
  'knowledge by:platobot@dergigi.com',
  'is:muted by:fiatjaf',

  // Date Filters
  'bitcoin since:2w',
  'until:2023-01-01',
  'hello since:2021-01-01 until:2021-12-31',
  'GM by:dergigi until:2024-06-06',
  'GN by:dergigi since:2025-10-31',
  'GM by:dergigi since:2024-01-01 until:2024-03-31',

  // Profile lookup / NIP-05
  'p:fiatjaf',
  'p:hodl',
  'p:dergigi.com',
  '@dergigi.com',
  'p:zaps.lol',
  'p:nostrplebs.com',
  'p:dave',
  'p:edward',
  'p:platobot@dergigi.com',
  'p:RSS',
  'p:twentyone.world',
  'kind:0 #bitcoin',

  // NIP search
  'nip:01',
  'nip:03',
  'nip:05',

  // OR operator
  'PV or 🤙',
  'kind:0 or kind:1',
  'is:image or is:highlight',
  '🧘‍♀️ or 🧘‍♂️ or 🧘 or 💆 ',
  '😂 or 🤣 or lol or lmao',
  'bitcoin OR lightning',
  '#plebchain or #introductions',
  'einundzwanzig or by:twentyone.world',
  '#runstr OR #plebwalk OR by:bitcoinwalk',
  '(p:dad OR p:husband OR p:father)',

  // Nested OR
  '(GM OR GN) by:dergigi has:image',
  'p:(NewsBot or RSS)',
  '(#yestr OR #nostr) (by:dergigi OR by:IntuitiveGuy)',

  // Media Modifiers
  'has:gif',
  'has:image',
  'has:video',
  'is:image',
  'has:image OR is:image',
  'has:video',
  'is:video',
  'giphy.gif',
  'meme has:gif',
  'Gregzaj1-ln_strike.gif',

  // Media Search
  'Liotta .gif',
  'GM has:video',
  'Bitcoin has:image',
  'by:dergigi has:image',
  'by:HODL has:video',
  'by:gregzaj has:gif',
  'is:image #Olas365',

  // URLs
  'site:yt', // Site-specific search
  'https://dergigi.com/vew', // URL
  'dergigi.com', // NIP-05

  // Kinds filter examples
  'is:zap by:marty',
  'is:bookmark by:hzrd',
  'is:file',
  'is:repost by:dor',
  'is:muted by:carvalho',
  'is:highlight',
  'is:code by:🌶️',
  'is:code by:hzrd149',
  'is:highlight by:dergigi',
  'is:highlight "proof of work"',
  'is:highlight (bitcoin OR nostr)',
  'is:highlight (by:fiatjaf.com OR by:@f7z.io)',
  'is:followpack art',
  'is:followpack (bitcoin OR nostr)',
  'is:followpack by:odell',

  // Multiple hashtags
  '#penisbutter or #⭕️',
  '#pugstr or #horsestr or #goatstr',

  // Long-form Articles
  'is:article bitcoin',
  'is:longform by:dergigi',

  // Multiple Authors
  'NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)',

  // Tag filters
  'reply:note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdpumft',
  'link:https://github.com/nostr-protocol/nips',
  'd:ants is:article',

  // Direct npub
  'GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',
  'proof-of-work by:npub1satsv3728d65nenvkmzthrge0aduj8088dvwkxk70rydm407cl4s87sfhu',
  'essay by:npub1sfhflz2msx45rfzjyf5tyj0x35pv4qtq3hh4v2jf8nhrtl79cavsl2ymqt',

] as const;

// Examples that require login to work properly
const loginRequiredExamples = [
  'by:@me',
  'GM by:@me',
  'mentions:@me',
  'by:@me has:image',
] as const;

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