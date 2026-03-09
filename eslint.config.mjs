import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import prettier from 'eslint-plugin-prettier'
import unusedImports from 'eslint-plugin-unused-imports'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const tsAllRulesOff = Object.fromEntries(
  Object.keys(tseslint.plugin.rules).map(name => [
    `@typescript-eslint/${name}`,
    'off',
  ]),
)

export default defineConfig(
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylisticTypeChecked,
  js.configs.recommended,
  {
    files: ['src/server/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        AsyncGenerator: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      prettier,
      import: importPlugin,
      'unused-imports': unusedImports,
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Warns
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Error
      'prettier/prettier': ['error'],
      'unused-imports/no-unused-imports': 'error',
      'no-shadow': 'off', // replaced by ts-eslint rule below
      '@typescript-eslint/no-shadow': 'error',

      // off
      'import/prefer-default-export': 'off',
      'lines-between-class-members': 'off',
      'no-param-reassign': 'off',
      'prefer-destructuring': 'off',
      'no-unused-vars': 'off',
      'no-underscore-dangle': 'off',
      'import/no-extraneous-dependencies': 'off',
      'no-nested-ternary': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      radix: 'off',
      'import/extensions': [
        'off',
        'ignorePackages',
        {
          js: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never',
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    rules: tsAllRulesOff,
  },
  {
    files: ['src/server/**/*.{test.ts,test.tsx,test.js,test.jsx}'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
)
