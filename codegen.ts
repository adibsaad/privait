import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  // The Tauri app's checked-in SDL snapshot (refreshed by the Rust
  // schema-snapshot test with PRIVAIT_UPDATE_SCHEMA_SNAPSHOT=1). Parity
  // against the original Fastify/Pothos schema is gated by
  // `pnpm schema:parity`.
  schema: './src-tauri/schema.snapshot.graphql',
  hooks: {
    afterAllFileWrite: ['prettier -w --config .prettierrc'],
  },
  generates: {
    'src/frontend/src/graphql/output/': {
      preset: 'client',
      documents: ['src/frontend/src/**/*.{ts,tsx}'],
    },
  },
  ignoreNoDocuments: true,
}

export default config
