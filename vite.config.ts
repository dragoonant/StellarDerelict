import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base './' keeps every asset URL relative, so the build works at any Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // the game, and the sound audition page (sounds.html)
      input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), sounds: fileURLToPath(new URL('./sounds.html', import.meta.url)) },
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/three/')) return 'three'
          if (id.includes('@react-three')) return 'r3f'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30000,
    passWithNoTests: true,
  },
})
