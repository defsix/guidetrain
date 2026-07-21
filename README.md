# GuideTrain

A gym training platform. Phase 1: pick your basics, then explore an interactive
3D anatomical model to see muscle groups.

## Screenshots

| Onboarding | Body explorer |
| --- | --- |
| ![Onboarding screen](docs/screenshots/01-onboarding.png) | ![3D muscle explorer](docs/screenshots/02-explorer.png) |

| Muscle group selected | Mobile |
| --- | --- |
| ![Quadriceps selected, showing region chips and the muscle detail panel](docs/screenshots/03-muscle-selected.png) | ![Mobile responsive layout](docs/screenshots/04-mobile.png) |

Screenshots are refreshed as each phase lands. To regenerate them yourself,
start the web dev server (see below), then:

```bash
node docs/screenshots/capture.mjs
```

## Structure

- `apps/web` — React + Vite + TypeScript + react-three-fiber frontend
  - `src/anatomy` — the 3D muscle-picker component (viewer, spatial zone
    mapping, muscle data) — see [Muscle model assets](#muscle-model-assets)
- `apps/api` — Express + TypeScript + Prisma (SQLite for local dev) backend.
  Not used by the current 3D viewer (see below), kept in place for the
  accounts/programs phases where it'll actually be needed.
- `data/muscle-groups.json` — muscle-group category data for the API's Prisma
  seed. Independent from `src/anatomy/muscle-map.json`, which drives the 3D
  viewer's per-muscle zones.

## 3D Model — Credits & License

The anatomical model (`apps/web/public/models/anatomy_full.glb`,
`anatomy_mobile.glb`) is derived from **"Front View of the Human
Musculature"** by *@rakhidalabanjan8*, generated with **Meshy AI (Meshy 6)**
and released under **CC0 1.0 (public domain)**.

- License: CC0 1.0 Universal — no rights reserved, no attribution required.
- Source: https://www.meshy.ai/3d-models/Front-View-of-the-Human-Musculature-019f45d0-4e70-7b90-b0cb-5cfa6ca09871
- Modifications: converted OBJ → GLB, decimated to a 113k-face mobile variant
  (2.2 MB) alongside the 283k-face full version (5.5 MB), and fitted with a
  spatial muscle-zone map (`apps/web/src/anatomy/muscle-map.json`, 31 zones
  across 7 regions) for interactive per-muscle selection — see
  `apps/web/src/anatomy/zoneMapping.js` for how a click/hover point resolves
  to a zone.

CC0 permits commercial use; this credit is included as good practice, not
obligation.

The model is a single fused mesh (no separable muscles), so selection works
by spatial zone rather than by picking a named sub-mesh — zone edges are
approximate, good for "train the chest" rather than teaching precise origins
and insertions. The back is AI-reconstructed and rougher than the front.

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

- **No backend.** The 3D viewer's muscle data is bundled into the build
  (`apps/web/src/anatomy/muscle-map.json`), not fetched from an API, so
  there's nothing server-side to deploy for Pages. `apps/api` exists for
  later phases (accounts, saved programs) — once those need real writes,
  Pages hosting will need a real backend deployment (e.g. Render/Fly.io)
  alongside it.
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
