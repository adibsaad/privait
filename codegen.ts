import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  // The Tauri app's checked-in SDL snapshot (refreshed by the Rust
  // schema-snapshot test with PRIVAIT_UPDATE_SCHEMA_SNAPSHOT=1). The old
  // Fastify server that used to serve this over HTTP is frozen.
  schema: './src-tauri/schema.snapshot.graphql',
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
      config: {
        includeDirectives: true,
      },
    },
  },
  ignoreNoDocuments: true,
}

export default config
