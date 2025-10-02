// Theme configuration for easy switching
export const AVAILABLE_THEMES = {
  darcula: 'prism-themes/themes/prism-darcula.css',
  dracula: 'prism-themes/themes/prism-dracula.css',
  nightOwl: 'prism-themes/themes/prism-night-owl.css',
  oneDark: 'prism-themes/themes/prism-one-dark.css',
  materialDark: 'prism-themes/themes/prism-material-dark.css',
  gruvboxDark: 'prism-themes/themes/prism-gruvbox-dark.css',
  nord: 'prism-themes/themes/prism-nord.css',
  vsDark: 'prism-themes/themes/prism-vsc-dark-plus.css',
  atomDark: 'prism-themes/themes/prism-atom-dark.css',
  synthwave: 'prism-themes/themes/prism-synthwave84.css',
} as const;

export type ThemeName = keyof typeof AVAILABLE_THEMES;

// Current theme - change this to switch themes easily
export const CURRENT_THEME: ThemeName = 'darcula';

export const getCurrentThemePath = (): string => {
  return AVAILABLE_THEMES[CURRENT_THEME];
};
