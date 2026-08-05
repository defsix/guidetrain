# Changelog

Newest first. Numbers in brackets are pull requests.

## Exercises

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
