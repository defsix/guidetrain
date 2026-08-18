import { defineConfig } from 'vitest/config'
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
  test: {
    // Playwright owns e2e/ (its own test runner, run via `npm run test:e2e`);
    // vitest's default include pattern would otherwise try to run those
    // .spec.ts files too and fail on the unfamiliar `@playwright/test` API.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
