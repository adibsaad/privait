import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-plugin-prettier'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import tailwindcss from 'eslint-plugin-tailwindcss'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      tsconfigRootDir: __dirname,
    },
    // plugins: ['react-hooks', 'react-refresh', 'unused-imports'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      'unused-imports': unusedImports,
      prettier,
      tailwindcss,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

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
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',

      // off
      'lines-between-class-members': 'off',
      'no-param-reassign': 'off',
      'prefer-destructuring': 'off',
      'no-unused-vars': 'off',
      'no-underscore-dangle': 'off',
      'react/jsx-filename-extension': 'off',
      'react/require-default-props': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'react/jsx-props-no-spreading': 'off',
      'react/jsx-one-expression-per-line': 'off',
      'react/prop-types': 'off',
      'no-nested-ternary': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
