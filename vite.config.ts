import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site at https://<user>.github.io/<repo>/,
  // so every asset URL needs that /<repo>/ prefix baked in at build time.
  base: '/wanderlay/',
  // maplibre-gl ships its own web worker bundle; Vite's esbuild-based dep
  // optimizer can pre-bundle it into a stale/mismatched worker file under
  // node_modules/.vite/deps, which then 404s at runtime ("file does not
  // exist ... maplibre-gl-worker.mjs"). Excluding it from pre-bundling
  // avoids that class of error entirely.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
