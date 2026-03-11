import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  // Have to get schema from the server because resolving it
  // via import will cause resolution errors
  schema: 'http://localhost:3000/graphql',
  hooks: {
    afterAllFileWrite: ['prettier -w --config .prettierrc'],
  },
  generates: {
    'src/frontend/src/graphql/output/': {
      preset: 'client',
      documents: ['src/frontend/src/**/*.{ts,tsx}'],
    },
    // Used by @0no-co/graphqlsp for vscode intellisense
    './src/server/graphql/generated/schema.graphql': {
      plugins: ['schema-ast'],
      watchPattern: './src/server/graphql/**/*.ts',
      config: {
        includeDirectives: true,
      },
    },
  },
  ignoreNoDocuments: true,
}

export default config
