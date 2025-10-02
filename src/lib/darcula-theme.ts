// Custom Darcula theme for prism-react-renderer
// Based on the Darcula theme from https://github.com/PrismJS/prism-themes

export const darculaTheme = {
  plain: {
    color: '#a9b7c6',
    backgroundColor: '#2b2b2b',
    fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'cdata'],
      style: {
        color: '#808080',
      },
    },
    {
      types: ['delimiter', 'boolean', 'keyword', 'selector', 'important', 'atrule'],
      style: {
        color: '#cc7832',
      },
    },
    {
      types: ['operator', 'punctuation', 'attr-name'],
      style: {
        color: '#a9b7c6',
      },
    },
    {
      types: ['tag', 'doctype', 'builtin'],
      style: {
        color: '#e8bf6a',
      },
    },
    {
      types: ['entity', 'number', 'symbol'],
      style: {
        color: '#6897bb',
      },
    },
    {
      types: ['property', 'constant', 'variable'],
      style: {
        color: '#9876aa',
      },
    },
    {
      types: ['string', 'char'],
      style: {
        color: '#6a8759',
      },
    },
    {
      types: ['attr-value'],
      style: {
        color: '#a5c261',
      },
    },
    {
      types: ['url'],
      style: {
        color: '#287bde',
        textDecoration: 'underline',
      },
    },
    {
      types: ['function'],
      style: {
        color: '#ffc66d',
      },
    },
    {
      types: ['regex'],
      style: {
        backgroundColor: '#364135',
      },
    },
    {
      types: ['bold'],
      style: {
        fontWeight: 'bold' as const,
      },
    },
    {
      types: ['italic'],
      style: {
        fontStyle: 'italic' as const,
      },
    },
    {
      types: ['inserted'],
      style: {
        backgroundColor: '#294436',
      },
    },
    {
      types: ['deleted'],
      style: {
        backgroundColor: '#484a4a',
      },
    },
  ],
};
