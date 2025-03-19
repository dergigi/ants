// Search examples that we'll randomly select from and test
export const searchExamples = [
  'p:fiatjaf',
  'vibe coding',
  '#PenisButter',
  'from:pablo ndk',
  '#YESTR',
  '#YESTR by:gigi',
  '#SovEng',
  '👀 by:gigi',
  'GM from:dergigi'
] as const;

// Helper type for type safety
export type SearchExample = typeof searchExamples[number]; 