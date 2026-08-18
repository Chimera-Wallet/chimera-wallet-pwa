import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@plausible-analytics/tracker': path.resolve(
        __dirname,
        './node_modules/@plausible-analytics/tracker/plausible.js',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/e2e/**', '**/node_modules/**'],
    // Required deployment config so startup validation passes in tests.
    env: {
      VITE_ARK_SERVER: 'https://signet.arkade.sh',
      VITE_DELEGATE_ENABLED: 'false',
      VITE_ARKADEWRAP_API: 'https://api.arkadewrap.test',
      VITE_ARKADE_ETH: 'test-eth',
      VITE_ARKADE_USDT: 'test-usdt',
      VITE_ARKADE_TRX: 'test-trx',
      VITE_ARKADE_POL: 'test-pol',
      VITE_ARKADE_CEXT: 'test-cext',
    },
  },
})
