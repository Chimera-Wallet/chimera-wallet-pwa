// Separate runner for src/test/live/** — tests that hit a locally running
// `func start` (api/), which itself calls Wirex's real sandbox API. Kept out
// of vitest.config.ts entirely (Node env, no jsdom setup, real global fetch,
// longer timeouts for live network calls) so it can never be picked up by
// the default `pnpm test` / CI run. See src/test/live/README.md.
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/live/**/*.live.test.ts'],
    testTimeout: 30_000,
    // Live sandbox calls should never run concurrently with each other
    // (e.g. two tests racing to create the same "ensure user" sandbox record).
    fileParallelism: false,
  },
})
