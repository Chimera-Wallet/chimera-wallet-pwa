import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import eslint from 'vite-plugin-eslint'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import basicAuth from './plugins/vite-plugin-basic-auth'

// Where the dev server forwards /api/* (the Azure Functions in api/, e.g. the
// CoinGecko proxy). Set per mode in .env / .env.staging; deliberately not
// VITE_-prefixed, as it is dev-server config, not something the app reads.
const apiProxyTarget = (command: string, mode: string): string | undefined => {
  if (command !== 'serve') return undefined // builds don't proxy
  const target = loadEnv(mode, process.cwd(), '').API_PROXY_TARGET
  if (!target) throw new Error(`API_PROXY_TARGET is not set for mode "${mode}"`)
  return target
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    basicAuth(),
    react(),
    tailwindcss(),
    eslint({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/test/**/*.ts', 'src/test/**/*.tsx'],
      cache: false,
    }),
    process.env.HTTPS === 'true' && basicSsl(),
  ].filter(Boolean),
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now().toString()),
  },
  server: {
    port: 3002,
    host: true,
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'],
    proxy: {
      '/api': {
        target: apiProxyTarget(command, mode),
        changeOrigin: true,
      },
    },
  },
  // In production, the web server needs to be configured to serve index.html for all routes
  // For most static hosting (Netlify, Vercel, etc.), this is handled automatically
  build: {
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: ['fs'],
    },
  },
  worker: {
    format: 'es',
  },
}))
