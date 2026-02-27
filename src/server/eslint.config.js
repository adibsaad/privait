import prettier from 'eslint-plugin-prettier'
import unusedImports from 'eslint-plugin-unused-imports'
import { defineConfig } from 'eslint/config'
import globals from 'globals'

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      prettier,
      'unused-imports': unusedImports,
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

      // off
      'lines-between-class-members': 'off',
      'no-param-reassign': 'off',
      'prefer-destructuring': 'off',
      'no-unused-vars': 'off',
      'no-underscore-dangle': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
])
