import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()], // Reads your tsconfig.json paths
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    setupFiles: ['./tests/setupTests.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
  },
})
