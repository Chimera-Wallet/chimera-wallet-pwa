import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now().toString()),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/wallet-service-worker.ts'),
      formats: ['es'],
      fileName: 'wallet-service-worker',
    },
    outDir: 'public',
    emptyOutDir: false,
    rollupOptions: {
      external: ['fs'],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: ['@arkade-os/sdk'],
  },
})
