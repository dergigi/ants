#!/usr/bin/env node

// Simple script to switch Prism themes
// Usage: node switch-theme.js <theme-name>

const fs = require('fs');
const path = require('path');

const AVAILABLE_THEMES = {
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
};

const themeName = process.argv[2];

if (!themeName) {
  console.log('Available themes:');
  Object.keys(AVAILABLE_THEMES).forEach(name => {
    console.log(`  - ${name}`);
  });
  process.exit(1);
}

if (!AVAILABLE_THEMES[themeName]) {
  console.error(`Theme "${themeName}" not found.`);
  console.log('Available themes:', Object.keys(AVAILABLE_THEMES).join(', '));
  process.exit(1);
}

const cssPath = `src/app/globals.css`;
const themePath = AVAILABLE_THEMES[themeName];

// Read current CSS file
let content = fs.readFileSync(cssPath, 'utf8');

// Replace the theme import
const importRegex = /@import "prism-themes\/themes\/prism-[^"]+\.css"; \/\* Current theme: [^*]+ \*\//;
const newImport = `@import "${themePath}"; /* Current theme: ${themeName} */`;

if (importRegex.test(content)) {
  content = content.replace(importRegex, newImport);
} else {
  // If no existing import, add it after the tailwindcss import
  content = content.replace(
    /@import "tailwindcss";/,
    `@import "tailwindcss";\n@import "${themePath}"; /* Current theme: ${themeName} */`
  );
}

// Write the updated content
fs.writeFileSync(cssPath, content);

console.log(`✅ Switched to theme: ${themeName}`);
console.log(`📁 Theme file: ${themePath}`);
