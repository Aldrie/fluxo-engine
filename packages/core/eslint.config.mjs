import * as eslintPluginImport from 'eslint-plugin-import';
import { baseConfig } from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**'],
  },
  {
    files: ['src/**/*.{js,mjs,cjs,ts,jsx,tsx}', 'tests/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    ignores: ['dist/**'],
    plugins: {
      import: eslintPluginImport,
    },
    rules: {
      'import/order': [
        'warn',
        {
          pathGroups: [
            { pattern: './execution/**', group: 'internal', position: 'before' },
            { pattern: './types/**', group: 'internal', position: 'after' },
            { pattern: './utils/**', group: 'internal', position: 'after' },
            { pattern: './logger', group: 'internal', position: 'after' },
          ],
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
        },
      ],
    },
  },
];
