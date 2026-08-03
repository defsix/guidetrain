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
`anatomy_mobile.glb`) is derived from a **Meshy AI (Meshy 6)** generation
released under **CC0 1.0 (public domain)**, with each muscle group then
hand-painted a distinct colour in the source texture.

- License: CC0 1.0 Universal — no rights reserved, no attribution required.
- Source: AI-generated via Meshy AI's text-to-3D pipeline, then colour-coded
  per muscle group by hand.

CC0 permits commercial use; this credit is included as good practice, not
obligation.

### How muscle selection works

Those hand-painted colours are what defines each muscle, so the build turns
them into geometry rather than approximating muscles with shapes:

1. Every triangle is sampled at its UV centroid to read the tint it was
   painted (the centroid keeps the sample clear of the atlas island borders,
   where JPEG bleed contaminates the colour).
2. Tints snap to the model's palette, and neighbouring triangles sharing a
   tint are grown into connected regions — one region per muscle, with left
   and right separating naturally since they don't touch.
3. Regions expand across the shaded, tendon and bone surface between them
   until every triangle is claimed.

That yields ~110 individual muscles, grouped into 18 muscle groups / 35
zones, baked onto each vertex as the model's `_ZONE` attribute. Picking at
runtime is just reading that number — see
`apps/web/src/anatomy/zoneMapping.js`.

Each triangle carries a single zone and vertices are split along the borders,
so muscle edges are hard lines rather than the gradient the shader would
otherwise blend between neighbouring vertex colours. Every muscle also gets its
own colour (`MUSCLE_COLORS`), with touching muscles deliberately given distant
hues — colouring by region instead put five of the seven regions in the
red/orange family, and a whole leg or arm read as one undifferentiated mass.

Because the zones follow the artwork, muscle edges are exact rather than
approximate. The earlier approach fitted an axis-aligned box per muscle in
normalised body space; boxes inevitably overlapped — an arm box would reach
across the torso and claim part of the back — so boundaries drifted from the
anatomy and needed hand-tuning.

The textures aren't shipped: the viewer paints muscles from its own region
palette, so the model only carries geometry plus the zone attribute. That
puts the mobile variant at 1.05 MB (60k faces) and the full one at 3.5 MB
(150k faces).

## Theming

Light, dark, or follow the device — a three-way switch in the header, remembered
across visits. Everything reads from CSS custom properties keyed off a
`data-theme` attribute on `<html>` (`apps/web/src/index.css`), so switching is a
single attribute swap. On "device" the app tracks the OS setting live, including
if it changes while the tab is open.

The 3D canvas can't read CSS variables, so `AnatomyViewer` maps the resolved
theme to real scene colours for the background, fog, lights and the inactive
greys used for untrainable parts.

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
