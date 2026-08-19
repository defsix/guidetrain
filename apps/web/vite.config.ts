import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Base stays '/' for the deployed site (guidetrain.me, served at the domain
// root -- the workflow used to pass --base=/guidetrain/ for the old
// defsix.github.io/guidetrain address). The `android`/`ios` modes are used
// only by the native app builds (see android/ and ios/ at the repo root),
// which bundle this build as local assets rather than serving it from a
// domain root, so they need relative asset paths instead.
export default defineConfig(({ mode }) => ({
  base: mode === 'android' || mode === 'ios' ? './' : '/',
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
}))
