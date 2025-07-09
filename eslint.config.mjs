import { FlatCompat } from '@eslint/eslintrc';
import pluginJs from '@eslint/js';
import pluginReact from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat();

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ['packages/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
  },
  { ignores: ['packages/**/dist/**/*'] },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  ...compat.extends('plugin:prettier/recommended'),
  ...compat.extends('plugin:react-hooks/recommended'),
  {
    rules: {
      'no-debugger': 'warn',
      'no-fallthrough': ['error', { commentPattern: 'break[\\s\\w]*omitted' }],
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
