// Search examples that we'll randomly select from and test
export const searchExamples = [
  'p:fiatjaf',
  'vibe coding',
  '#PenisButter',
  'by:pablo ndk',
  '#YESTR',
  '#YESTR by:gigi',
  '#SovEng',
  '👀 by:gigi',
  'GM by:dergigi',
  '.jpg by:corndalorian',
  'GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc'
] as const;

// Helper type for type safety
export type SearchExample = typeof searchExamples[number]; 