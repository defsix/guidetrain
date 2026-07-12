# GuideTrain

A gym training platform. Phase 1: pick your basics, then explore an interactive
3D anatomical model to see muscle groups.

## Screenshots

| Onboarding | Body explorer |
| --- | --- |
| ![Onboarding screen](docs/screenshots/01-onboarding.png) | ![3D muscle explorer](docs/screenshots/02-explorer.png) |

| Muscle group selected | Mobile |
| --- | --- |
| ![Obliques selected with detail panel](docs/screenshots/03-muscle-selected.png) | ![Mobile responsive layout](docs/screenshots/04-mobile.png) |

Screenshots are refreshed as each phase lands. To regenerate them yourself,
start both dev servers (see below), then:

```bash
node docs/screenshots/capture.mjs
```

## Structure

- `apps/web` — React + Vite + TypeScript + react-three-fiber frontend
- `apps/api` — Express + TypeScript + Prisma (SQLite for local dev) backend
- `data/muscle-groups.json` — shared muscle group data; both the API's Prisma
  seed and the web app's static (no-backend) fallback read from this one file

## Muscle model assets

The 3D muscle meshes in `apps/web/public/models/muscles` are decimated from
[BodyParts3D/Anatomography](http://lifesciencedb.jp/bp3d/), via the
[Kevin-Mattheus-Moerman/BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D)
STL mirror, licensed **CC BY-SA** (Life Science Integrated Database Center).
If you redistribute this app, keep the attribution:

> BodyParts3D, © Life Science Integrated Database Center, licensed under
> CC Attribution-Share Alike 2.1 Japan.

Each original file was ~2-27MB; they were decimated (~96%+ triangle reduction)
down to ~6.7MB total for all 70 parts so they're reasonable to ship on the web.
14 muscle groups are covered: chest, back, upper back, shoulders, trapezius,
biceps, triceps, forearms, abs, obliques, glutes, quads, hamstrings, calves.

## Hosting on GitHub Pages

The web app is a static site once there's no backend to hit, so it deploys
straight to GitHub Pages via `.github/workflows/deploy-pages.yml` — it builds
and publishes `apps/web` on every push to `main` (and can be run manually from
the Actions tab).

**One-time setup** (repo admin, not something a workflow can do on its own):
in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. After
that the workflow deploys automatically; the URL shows up on the same Pages
settings screen and on each deploy run.

Two things only apply to the *Pages* build:

- **No backend.** Phase 1's API is read-only (14 muscle groups, no accounts
  yet), so the frontend falls back to the same seed data bundled at build
  time (`data/muscle-groups.json`) whenever `VITE_API_URL` isn't set — which
  it deliberately isn't in the Pages workflow. Local dev still talks to the
  real Express/Prisma API. Once accounts/programs need real writes, Pages
  hosting will need a real backend deployment (e.g. Render/Fly.io) instead.
- **Hash-based routes.** GitHub Pages can't rewrite unknown paths back to
  `index.html`, so the deployed app uses a `#` in the URL
  (`.../guidetrain/#/explore`) instead of clean paths. Local dev is unaffected.

## Running locally

```bash
npm install

# API (http://localhost:4000)
cd apps/api
cp .env.example .env
npx prisma migrate dev
npx prisma db seed
npm run dev

# Web (http://localhost:5173), in another terminal
cd apps/web
cp .env.example .env.local
npm run dev
```

## Roadmap

1. ✅ 3D anatomical body model with selectable muscle groups
2. Training exercises per muscle group (illustrations, animations, YouTube search)
3. Personal training programs (build your own, save/bookmark)
4. Accounts (username, sex, approximate age) and public program library
