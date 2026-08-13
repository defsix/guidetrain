import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Base stays '/' everywhere. The deployed site is guidetrain.me, served at the
// domain root, so there is no subpath to account for -- the workflow used to
// pass --base=/guidetrain/ for the old defsix.github.io/guidetrain address.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: ['..', '../..'],
    },
  },
})
