// Search examples that we'll randomly select from and test
export const searchExamples = [
  // Basic
  'vibe coding',
  '#PenisButter',
  '#YESTR',
  '#SovEng',
  
  // Author
  'by:dergigi',
  'by:gigi',
  'by:pablo',
  'by:corndalorian',

  // Combined
  'GM by:dergigi',
  '#YESTR by:dergigi',
  '👀 by:dergigi',
  '.jpg by:corndalorian',

  // Direct npub
  'GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',

  // Profile lookup / NIP-05
  'p:fiatjaf',
  '@dergigi.com',

  // Operators & media
  'bitcoin OR lightning',
  'https://dergigi.com/vew',
  'has:image',
  'is:image',
  'has:video',
  'is:video',
  'has:gif',
  'is:gif'
] as const;

// Helper type for type safety
export type SearchExample = typeof searchExamples[number]; 