import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Local dev/build/preview all stay at '/'. The GitHub Pages workflow builds
// with `vite build --base=/guidetrain/` since the project site is served
// from a subpath there.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: ['..', '../..'],
    },
  },
})
