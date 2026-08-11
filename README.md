# GuideTrain

A gym training platform. Phase 1: pick your basics, then explore an interactive
3D anatomical model to see muscle groups.

## Screenshots

| Onboarding | Body explorer |
| --- | --- |
| ![Onboarding screen](docs/screenshots/01-onboarding.png) | ![3D muscle explorer](docs/screenshots/02-explorer.png) |

| Muscle group selected | Mobile |
| --- | --- |
| ![Quadriceps selected, showing the muscle picker and the detail panel](docs/screenshots/03-muscle-selected.png) | ![Mobile responsive layout](docs/screenshots/04-mobile.png) |

Regenerate them with the web dev server running: `node docs/screenshots/capture.mjs`.

## Structure

- `apps/web` — React + Vite + TypeScript + react-three-fiber frontend
  - `src/anatomy` — the 3D muscle picker (viewer, zone lookup, muscle data)
- `apps/api` — Express + TypeScript + Prisma (SQLite locally). Not used by the
  viewer yet; kept for the accounts/programs phases.
- `data/muscle-groups.json` — category data for the API's Prisma seed, separate
  from `src/anatomy/muscle-map.json`, which drives the viewer's zones.
- `tools/muscle-segmentation` — the build that turns the painted model into the
  shipped `.glb`. See [its README](tools/muscle-segmentation/README.md).

## The 3D model

`apps/web/public/models/anatomy_{full,mobile}.glb` is derived from a **Meshy AI
(Meshy 6)** generation released under **CC0 1.0** (no rights reserved, no
attribution required — this credit is good practice, not obligation), with each
muscle group then hand-painted a distinct colour in the source texture.

Those painted colours are what define each muscle. The build reads them and
turns them into geometry rather than approximating muscles with boxes: triangles
are sampled at their UV centroids, grown into connected regions of one tint, and
expanded across the untinted surface between them. That yields ~110 regions,
grouped into **20 zones** — one per muscle, covering both sides, since left and
right biceps are the same thing to train — baked onto every vertex as the glTF
`_ZONE` attribute. Picking at runtime is just reading that number
(`apps/web/src/anatomy/zoneMapping.js`).

Because zones follow the artwork, muscle edges are exact. The earlier approach
fitted an axis-aligned box per muscle; boxes overlapped, so an arm box would
reach across the torso and claim part of the back.

Textures aren't shipped — the viewer paints from its own palette, so the model
carries only geometry and the zone attribute: 1.1 MB (60k faces) for mobile,
3.6 MB (150k faces) for the full one.

**How the labelling is kept honest** — measured landmarks instead of assumed
heights, front/back decided by which way a region's surface faces, the model
folded onto itself so left and right always agree (0.8% mirror disagreement,
`tools/muscle-segmentation/check-symmetry.py`), and borders smoothed on the
decimated mesh. All of it, with the numbers, is in the
[pipeline README](tools/muscle-segmentation/README.md).

## Colour

`MUSCLE_COLORS` (`apps/web/src/anatomy/zoneMapping.js`) is the single source of
colour for both the model and the picker, so a swatch in the list is exactly the
colour on the body. It's a system, not seventeen separate choices: nine hues
evenly spaced round the wheel, each at a deep and a bright step at matched
chroma.

Every pair a person can confuse — muscles that touch on the model, muscles
listed one above the other in the picker — is scored by OKLab distance under
normal vision and under simulated colour blindness. The palette clears the
lightness band, chroma floor and both separation floors against **the light and
the dark canvas alike**. Built by `tools/muscle-segmentation/palette-design.py`.

## Exercises

Selecting a muscle lists the exercises that train it — step-by-step
instructions, equipment, difficulty, and a YouTube search link (a search rather
than a fixed video id, so it can't rot and needs no API key). 180 exercises
across all 17 zones, built by `tools/exercises/build-exercises.py` from the
[Free Exercise DB](https://github.com/yuhonas/free-exercise-db), which is public
domain under the Unlicense.

**No third-party images are bundled.** That dataset ships photos, but they carry
no stated licence — the question was [asked in 2024](https://github.com/yuhonas/free-exercise-db/issues/12)
and closed unanswered, and the upstream doesn't say where they came from. Every
other reachable illustrated set was worse. So an exercise is illustrated on the
app's own model instead: opening one lights the muscles it trains, primary solid
and secondary dimmed. That is more useful than a stock photo and entirely ours.

Two zones needed work the source couldn't do. It has no oblique category — all
rotation and side-bending sits under "abdominals" — so those are separated by
movement. It has nothing usable for tibialis anterior, so six exercises are
named in the build script and marked `"source": "curated"`.

### Video

Every one of the 180 exercises plays a real demonstration in the app, in a
click-to-load `youtube-nocookie` player — nothing is fetched from YouTube until
you open one. A *search* cannot be embedded (YouTube removed `listType=search`
in November 2020), so this needs real video ids:

```bash
YOUTUBE_API_KEY=... python3 tools/exercises/resolve-videos.py
```

That runs at build time and writes the ids into `exercises.json`, so the shipped
app carries no key — which matters on GitHub Pages, where anything in the bundle
is public. The binding limit is a flat **100 `search.list` calls a day** — one
per exercise — rather than the 10,000-unit pool, which covers the other
endpoints; already-resolved exercises are skipped, so it can be run across
several days. (Exhausting it returns **429 `rateLimitExceeded`**, not the 403
`quotaExceeded` the docs imply, and only in the response body — so the script
reads the body and stops rather than reporting every remaining exercise as
broken.) It also checks each video is actually embeddable, since an owner can
forbid it and such a video would open an empty player.

**A wrong video is worse than none**, so a result is kept only if its title
shares a meaningful word with the exercise name. What counts as meaningful is
the whole trick. A single letter or a bare number does not — neither identifies
a movement, and letting them count is how "V-Bar Pullup" matched *Top 9 Lats
Exercises for a V-Shape Body*. Nor do posture and setup qualifiers: half the
catalogue is "standing" or "seated" something, so agreeing on one is no
evidence, which is how "Standing Olympic Plate Hand Squeeze" reached *How to do
Standing Military Press*. "bar" is shared by pullup bars, barbells and T-bars
alike, and it paired "V-Bar Pullup" with a *V Bar Pulldown*. A trailing plural
is folded, so *T-Bar Rows* still meets "T-Bar Row".

The top hit for a less common movement is often a general muscle video:
"Reverse Barbell Curl" came back with *BIGGER Forearms Workout*. The gate
rejects those and keeps differently worded good matches — "Romanian Deadlift"
still meets *RDL Tutorial* through a small alias table, and "Standing Olympic
Plate Hand Squeeze" now opens *How to - Plate Pinch*. `--revalidate` re-checks
ids already in the file and drops any that fail, which is how the two above were
caught. Rejects fall back to the search link, which always works.

An API key is free and needs no billing. It reads public data only: it cannot
touch a YouTube account, and it isn't used at runtime, so it can be deleted once
the ids are baked in.

Anything without an id keeps the YouTube search link, and the player always
offers that way out too — video ids rot, and every exercise having one today is
not a promise it still will, which is why the search link exists in the first
place.

### wger, and why it isn't used

wger's catalogue is CC-BY-SA with proper per-image licence and author fields,
and share-alike is acceptable here — but it doesn't fit. Matching its images
onto this list by name hits **4%**; loosening the match to reach 21% starts
pairing "Barbell Curl" with "Barbell Wrist Curl", and a wrong illustration is
worse than none. Pairing images correctly would mean rebuilding the list from
wger records, which has **no exercises at all** for neck, erector spinae,
forearms, adductors or tibialis anterior — five of the seventeen zones — and
only a third of its exercises carry an image.

## Languages

Ten: English, Czech, German, Spanish, French, Polish, Portuguese, Russian,
Simplified Chinese, Japanese. **The device decides** — `navigator.languages` is
negotiated against that list on load — and a picker in the header overrides it
if you want something other than what the machine is set to.

Regional tags collapse (`pt-BR` and `pt-PT` both get `pt`, `es-419` gets `es`),
any `zh` lands on Simplified, and anything unsupported falls back to English.
Only the active language is downloaded: each is its own ~4 KB chunk, with
English in the main bundle because it is also the per-key fallback — an
untranslated key renders English rather than a raw key.

Translated everywhere: the whole interface, all 20 muscle names and
descriptions, the region and equipment labels.

Exercise names and instructions are a much larger job — 180 names and 815 steps,
~23,000 words per language — and **all nine are now done**, in
`src/i18n/exercises/<locale>.json`. They are lazy-loaded apart from the
interface (~27–31 KB gzipped each) and fetched only when a muscle is opened, so
the chunk every visitor waits on stays ~4 KB. A key without a translation falls
back to the English text, so a gap reads as English prose inside a translated
app rather than as breakage.

    node tools/i18n/dump-exercises.mjs <from> <to>   # source text to translate

Counts use `Intl.PluralRules`, so Polish, Russian and Czech get their three
forms (`5 ćwiczeń`, not `5 ćwiczenia`) rather than an English two-form guess.
`node tools/i18n/check-locales.mjs` checks every locale against English for
missing keys, dropped `{placeholders}` and missing plural forms.

## On a phone

The muscle picker and display panel float over the canvas. That is fine when
there is room beside the model and useless when there isn't: at 390px they
covered 44% of the width, and at 320px the body was reduced to one arm and a
pair of legs behind them. Below 720px they start closed and open one at a time
from a toolbar, and choosing a muscle closes the picker again — otherwise it
would hide the muscle you just picked. Tapping outside dismisses them.

Opening a muscle raises the sheet over the lower half of the canvas, so the
body moves out from behind it: it lifts by half of what is covered and scales
down to fit the band that's left, then settles back when the sheet closes. How
much is covered is *measured* rather than assumed — the sheet is shorter for a
muscle with four exercises than for one with twelve. The model moves, not the
camera, so orbiting and zooming still belong entirely to you.

Exercise names wrap instead of truncating. "Standing Palms-Up Barbell Behind
The Back Wrist Curl" has no useful prefix, so an ellipsis told you nothing, and
the translations run longer than the English.

The model is 1.1 MB, so the canvas now says it is loading rather than sitting
empty. The overlay clears when the body is painted, which is the honest moment
— the environment map may still be arriving, but there is something to look at.

## Theming

Light, dark, or follow the device — one button in the header cycles the three
and remembers the choice. Everything reads from CSS custom properties keyed off
`data-theme` on `<html>` (`apps/web/src/index.css`), so switching is one
attribute swap; on "device" the app tracks the OS setting live. The 3D canvas
can't read CSS variables, so `AnatomyViewer` maps the resolved theme to real
scene colours for the background, fog, lights and inactive greys.

## Running locally

```bash
npm install

# API (http://localhost:4000)
cd apps/api
cp .env.example .env
npx prisma migrate dev && npx prisma db seed && npm run dev

# Web (http://localhost:5173), in another terminal
cd apps/web
cp .env.example .env.local
npm run dev
```

## Hosting on GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes `apps/web` on every
push to `main`. **One-time setup:** in **Settings → Pages**, set **Source** to
**GitHub Actions**.

Two things apply only to the Pages build:

- **No backend.** Muscle data is bundled (`src/anatomy/muscle-map.json`), not
  fetched. `apps/api` exists for later phases; once those need real writes,
  Pages will need a backend deployed alongside (e.g. Render/Fly.io).
- **Hash routes.** Pages can't rewrite unknown paths to `index.html`, so the
  deployed app uses `.../guidetrain/#/explore`. Local dev is unaffected.

## Roadmap

1. ✅ 3D anatomical body model with selectable muscle groups
2. ✅ Training exercises per muscle group — instructions, equipment, the muscles
   lit on the model, and a real demonstration video for all 180
3. Personal training programs (build your own, save/bookmark)
4. Accounts (username, sex, approximate age) and public program library

Asked for, not yet built:

- **Autoplay on selection** — open an exercise and its video starts, rather than
  waiting for a second click on the player.
- **Training pairs** — while you train one muscle, suggest a second exercise to
  do between sets (supersets), so the rest period does something.

Changes are logged in [CHANGELOG.md](CHANGELOG.md).
