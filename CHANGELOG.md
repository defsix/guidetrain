# Changelog

Newest first. Numbers in brackets are pull requests.

## Languages

- **Exercise text: Spanish, Polish, Russian, Czech, German, French and Portuguese** — all 180 exercise names and 815
  instruction steps per language, ~23,000 words each. Lazy-loaded separately from the interface
  (~30 KB gzipped) and only once a muscle is opened, so the language chunk
  every visitor waits on stays ~4 KB. Languages arrive one at a time; those
  without a file fall back per key to English, so nothing renders broken.
- **Ten languages, chosen by the device** — English, Czech, German, Spanish,
  French, Polish, Portuguese, Russian, Simplified Chinese and Japanese, matched
  from `navigator.languages` with a header picker to override. Regional tags
  collapse (`pt-BR`/`pt-PT` → `pt`), any `zh` lands on Simplified, anything
  unsupported falls back to English. Each language is its own ~4 KB chunk, so
  only the active one is downloaded.
- **Interface, muscles and equipment translated**; exercise names and
  instructions stay English and fall back per key, so nothing renders as a raw
  placeholder.
- **Real plurals** — `Intl.PluralRules` picks the form, so Polish, Russian and
  Czech get their three (`5 ćwiczeń`) instead of an English two-form guess.
- **Muscle names wrap instead of truncating**, which they had started doing in
  Russian and Polish once the anatomical names got long.
- `tools/i18n/check-locales.mjs` fails on a missing key, a dropped
  `{placeholder}` or a missing plural form.

## Exercises

- **Relevance gate on resolved videos** — a video is kept only if its title
  shares a meaningful word with the exercise name, so "Reverse Barbell Curl" no
  longer opens *BIGGER Forearms Workout*; an alias table keeps differently
  worded good matches ("Romanian Deadlift" ↔ *RDL Tutorial*). Ten wrong ids were
  dropped by the new `--revalidate` pass. Rejects fall back to the search link.
  The resolver also now recognises an exhausted daily quota, which arrives as
  429 in the response body rather than the documented 403, and stops instead of
  reporting every remaining exercise as broken.
- **Video ids resolved** [#17, #22] — 136 of 180 exercises now open a real
  demonstration; the rest keep the search link until the next quota day.
- **Gate tightened** — a single letter or a bare number no longer counts as a
  shared word, which is how "V-Bar Pullup" had matched *Top 9 Lats Exercises
  for a V-Shape Body* on the lone "v". Real three-letter words still count.
- **Video in the app** — an exercise with a known video plays it in a
  click-to-load `youtube-nocookie` player rather than sending you to a new tab;
  nothing is fetched from YouTube until you open one. Ids are resolved at build
  time by `tools/exercises/resolve-videos.py` so no API key ships, and anything
  without one keeps the search link.
- **wger evaluated and declined** — CC-BY-SA with clean per-image licensing, but
  its images match this list at 4% by name, loosening the match starts pairing
  biceps curls with wrist curls, and rebuilding around it would lose five of the
  seventeen zones outright.

- **Exercises per muscle** — selecting a muscle lists the exercises that train
  it, expandable to step-by-step instructions, equipment and difficulty, with a
  YouTube search link. 180 exercises across all 17 zones, from the public-domain
  [Free Exercise DB](https://github.com/yuhonas/free-exercise-db).
- **Shown on the model, not in a photo** — opening an exercise lights the
  muscles it trains on the body itself, primary solid and secondary dimmed. No
  illustrated dataset with a usable image licence was reachable, and the app's
  own model says it better than a stock photo would.

## Muscle model

- **Hip crease, smooth borders, full picker** [#13] — the trunk-to-leg line
  follows the hip crease instead of a horizontal plane, so obliques no longer
  cover the top of the quadriceps. Borders are smoothed on the decimated mesh
  (mirror-paired, which also took symmetry from 3.3% to **0.8%**). One palette
  now serves both the model and the picker, validated for light and dark; the
  picker lists all 17 muscles grouped by region.
- **Facing, not centres** [#12] — which muscle a region is comes from how much
  of its surface faces each way, not where its centre sits; the adductors from
  how much faces the midline. Regions covering two muscle groups are cut at a
  measured landmark, which put erector spinae back in the lumbar region (from
  12% of the body to 4%) and the neck back on the neck.
- **Folded onto itself** [#11, #12] — each region is joined to the region
  covering its mirror image, then cut along the mirror of the other side's
  borders, so left and right always come out the same. 13.5% → 0.3% before
  decimation.
- **Paired selection** [#11] — left and right of a muscle are one zone and
  highlight together.
- **Elbow landmark** [#10] — measured rather than assumed, so a patch spanning
  the elbow stops swallowing the forearm into the biceps.
- **Denoising** [#8] — an edge-preserving pass over the colour samples drops
  noise inside a muscle sixfold, which is what lets quadriceps separate from
  hamstrings on colour alone.
- **Painted outlines as borders** [#7] — muscle groups follow the colours the
  artist painted, ending the bleed left by threshold-placed seams.
- **Colour regions replace boxes** [#5] — picking reads a baked `_ZONE`
  attribute instead of testing axis-aligned boxes that overlapped each other.

## App

- **Light / dark / device** [#6, #9] — one button cycling the three, remembered
  across visits, with the 3D scene colours following the resolved theme.
- **Distinct muscle colours** [#6] — a colour per muscle rather than per region,
  which had made a whole limb read as one mass.
- **GitHub Pages** [#6] — static deploy on every push to `main`.

## Phase 1

- **Body explorer** [#1, #2, #3] — onboarding (name, sex, age band) into an
  interactive 3D anatomical model with a per-muscle detail panel and Train
  action, on a CC0 fused-mesh model.
