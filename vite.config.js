import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built assets resolve correctly when loaded from a
// chrome-extension:// URL rather than a web server root.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
