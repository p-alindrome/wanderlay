import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site at https://<user>.github.io/<repo>/,
  // so every asset URL needs that /<repo>/ prefix baked in at build time.
  base: '/wanderlay/',
})
