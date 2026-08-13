# Changelog

Newest first. Numbers in brackets are pull requests.

## Languages

- **Exercise text in all ten languages** — 180 exercise names and 815
  instruction steps per language, ~23,000 words each, for Spanish, Polish,
  Russian, Czech, German, French, Portuguese, Japanese and Simplified Chinese.
  Lazy-loaded separately from the interface (~27–31 KB gzipped each) and only
  once a muscle is opened, so the language chunk every visitor waits on stays
  ~4 KB. An untranslated key still falls back to English, so a gap would read
  as English prose rather than as breakage.
- **Ten languages, chosen by the device** — English, Czech, German, Spanish,
  French, Polish, Portuguese, Russian, Simplified Chinese and Japanese, matched
  from `navigator.languages`. Regional tags
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

- **Training pairs** — opening an exercise now suggests three to superset it
  with, so the rest between sets trains something; tapping one plays its
  demonstration. Pairing is by non-competing region, and region of the
  *primary* muscle alone would not have done it: a lat pulldown is Back and a
  biceps curl is Arms, yet both load the biceps, and 13% of ordered pairs in
  the catalogue differ on that point. The rule maps every muscle an exercise
  names, primary and secondary, to its region and requires the two sets to be
  disjoint — which subsumes "no shared muscle", since a muscle belongs to one
  region. Every exercise keeps at least 4 legal partners, median 91, so nothing
  is left unpaired. Ranking is what makes them useful at that count: a
  demonstration first, then no extra kit, then the same difficulty, spread
  across different primary muscles and stable between calls.
  `tools/exercises/check-pairs.mjs` verifies all of that against the shipped
  data and exits non-zero on a violation.
- **A video has to match the variant, not just the movement** — sharing a word
  was necessary and not sufficient. "Seated Dumbbell Curl" opened *Incline
  Dumbbell Curl*, and "Band Hip Adductions" opened a *Banded Hip Abduction*,
  which is the opposite movement on a different muscle. A title is now also
  rejected when it contradicts the name: mutually exclusive qualifiers (nothing
  is both seated and incline; a barbell is not a Smith machine), or a
  qualifier the title lacks (*Cable Crunch* is not a "Cable Reverse Crunch").
  Several of those words are in the stop list, where they carry no weight as
  agreement — half the catalogue is "seated" something — and that is the point:
  a word can be worthless as evidence of a match and conclusive as evidence of
  a mismatch. Synonyms had to be taught alongside it ("leverage" is a machine,
  a rope hangs off a cable), or the rule discarded two correct videos. 17 wrong
  ids caught.
- **No two exercises share a video** — each was resolved knowing nothing about
  the others, so one cable crunch video served four of them, and Train This
  opened the same video two presses running and looked broken. `--dedupe`
  leaves it with whichever name the title matches best and re-searches the
  rest; a search now passes over anything already taken while another candidate
  remains, falling back to a shared video only when nothing else matches. 11
  freed, 0 duplicates left.
- **174 of 180 have a video, down from 180** — and that is the rule working,
  not a regression. Six suspended, decline and reverse variants had been
  showing the plain version of the movement, and nothing found demonstrates the
  real one. They keep the YouTube search link. A reader told a video shows
  their exercise has no reason to doubt it; a search link makes them choose,
  which is the honest answer. Every muscle still has at least four playable
  exercises, so Train This works everywhere.
- **Relevance gate on resolved videos** — a video is kept only if its title
  shares a meaningful word with the exercise name, so "Reverse Barbell Curl" no
  longer opens *BIGGER Forearms Workout*; an alias table keeps differently
  worded good matches ("Romanian Deadlift" ↔ *RDL Tutorial*). Ten wrong ids were
  dropped by the new `--revalidate` pass. Rejects fall back to the search link.
  The resolver also now recognises an exhausted daily quota, which arrives as
  429 in the response body rather than the documented 403, and stops instead of
  reporting every remaining exercise as broken.
- **Every exercise now opens a real demonstration** [#17, #22] — all 180 have a
  resolved video id, finished across four quota days.
- **Gate tightened twice** — a single letter or a bare number no longer counts
  as a shared word, which is how "V-Bar Pullup" had matched *Top 9 Lats
  Exercises for a V-Shape Body* on the lone "v". Nor do posture and setup
  qualifiers ("standing", "seated", "bar", "machine"): half the catalogue is
  "standing" something, so agreeing on one is no evidence, and that let
  "Standing Olympic Plate Hand Squeeze" reach *How to do Standing Military
  Press* and "V-Bar Pullup" a *V Bar Pulldown*. Both were caught by
  `--revalidate` and re-resolved correctly. A trailing plural is now folded, so
  *T-Bar Rows* still meets "T-Bar Row". Real three-letter words still count.
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

- **Forearm no longer lights part of the thigh** — the arms hang beside the
  legs, and region growing crossed the gap: 127 faces on the upper thighs were
  labelled "forearm", and a further 87 were labelled "hand" while the real
  hands ended up as forearm. `5-despeckle-zones.py` finds both from geometry —
  an island far from the muscle it names, or a zone too small to be a muscle
  and in scattered pieces — and folds each patch into the surface around it.
  Mirror disagreement **improves from 0.76% to 0.73%**, since the strays were
  themselves a source of it. Known and not fixed: the hands still carry the
  forearm's colour rather than rendering as an untrainable part.

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

- **Getting to the next max** — an exercise with a usable logged set now shows
  a plan: an estimated one-rep max, a target you set, and how many four-week
  cycles it takes with the loads for every week. There is deliberately no field
  for typing in a max — an estimate from a set you performed is a calculation, a
  number you typed is a claim, and the set the estimate came from is shown so
  the figure is checkable. Epley for the estimate, capped at 12 reps; Wendler
  5/3/1 for the plan, training max at 90%, weeks at 65/75/85, 70/80/90,
  75/85/95 and a 40/50/60 deload, +5 kg lower body and +2.5 kg upper per cycle.
  Percentages checked against sources rather than recalled. Loads round to
  2.5 kg, since plates come in pairs. Working the example caught a real error
  before it shipped: Epley at 1 rep returns `w × 1.033`, so a 100 kg single
  would have been reported as a 103.3 kg max — a single is now returned as
  itself.
- **Log what you lifted** — each exercise in the workout takes sets, a weight
  and a rep count, kept with the date; today's sets show as pills and the
  heaviest set ever recorded shows underneath. The weight field keeps its value
  between sets and the reps field clears, since the weight repeats and the reps
  don't, and a comma is accepted as the decimal separator because it is the
  separator in most of the ten languages and `parseFloat("62,5")` silently
  returns 62. Units are kg or lb stored **per entry**, so switching the
  preference changes what happens next and never what already happened; "best"
  compares only within a unit, since 135 lb and 60 kg are the same lift and 135
  is the bigger number. The best figure is deliberately a set that happened
  rather than an estimated one-rep max — estimating belongs to the progression
  feature and wants its formulas checked against sources first.
- **A saved workout** — **+** beside any exercise adds it to a list, the header
  button carries the count, and the panel reorders, removes and clears. It
  stores ids rather than exercises, so a workout saved in one language opens in
  another and a corrected instruction shows the correction; saving *Barbell
  Bench Press - Medium Grip* and reopening under `pl-PL` gives *Wyciskanie
  Sztangi na Ławce Płaskiej - Chwyt Średni*. Reordering is buttons, not drag —
  hard to hit on a phone, impossible from a keyboard, and two taps beat a
  gesture on a list this short. Persisted to `localStorage` beside the profile,
  so it is per-device: there is no backend to sync to, which is what accounts
  would change. `AnatomyViewer` takes optional `savedIds`/`onToggleSave` and
  renders the control only when both are passed, so it stays a drop-in.
- **Training pairs moved under Train This**, above the exercise list, after
  being reported as missing — they had been inside an expanded exercise, below
  eight steps of instructions, findable only by someone who already knew to
  scroll. They now answer the muscle until an exercise is open and that
  exercise once it is, which is the sharper question: a bench press loads the
  triceps and a chest fly barely does, so before you say which, the weaker
  claim is the only honest one.
- **The fonts the design always named are now actually there** — `Space
  Grotesk` and `JetBrains Mono` were declared in the CSS but never bundled: no
  `@font-face`, no font file, so both silently fell back and every visitor read
  the fallback on every screen. They are now self-hosted rather than linked
  from Google's CDN, which would have told a third party which pages a reader
  opens — the same trade the video player already declines. SIL OFL 1.1, both
  licences committed beside the files. Variable fonts split by script: 106 KB
  in total but nobody downloads that, since the browser takes only the subsets
  a page needs — English two files (62 KB), Polish four, Russian three. Space
  Grotesk has no Cyrillic and neither face has CJK, so those fall back per
  glyph, correctly.
- **One font stack, and controls that use it** — `--sans` and `--mono` are
  declared once and inherited everywhere, instead of being written out at
  thirteen call sites where the canvas and the page disagreed about the
  fallback chain. The username input had been rendering in Arial, since form
  controls take a UA font unless told to inherit and only `button` had been
  told.
- **The body is one colour until you ask it a question** — grey, dark or light
  to suit the theme, with the muscle you pick in the theme's own orange and
  nothing else wearing anything. Opening an exercise puts that orange on what
  the movement is about, a softened version on what it merely uses, and drops
  the rest of the body back. It used to arrive wearing seventeen colours, one
  per muscle, which showed everything at once and so emphasised nothing — a
  body already lit up everywhere cannot answer "which one is the quadriceps".
  Traced muscle borders stay, so the map survives; the picker's swatches now
  say the same thing the body does. `MUSCLE_COLORS` and its OKLab generator are
  kept but unapplied, since the palette was never the problem.
- **The first screen says what is behind it** — it was three questions on a
  blank page, correct and silent about where answering them leads. It now opens
  with the name, an accent wash, and three figures counted from the data rather
  than typed in: 17 muscle groups, 180 exercises, 10 languages. The greyed-out
  button also says what it is waiting for ("2 more to fill in"), announced
  politely for a screen reader, where before it just sat there disabled.
- **Train This picks an exercise** — the button named an intention and then did
  nothing you could see. It now opens one of that muscle's exercises in the
  player, for anyone who wants to train the muscle and doesn't want to choose
  which way; the list underneath still belongs to anyone who does. Only
  exercises with a video are drawn from — all 180 have one today, but ids rot
  and `--revalidate` drops the bad ones. The `onTrain` prop and the
  `muscle:train` event still fire, so a host app can record the choice.
- **Shuffled, not random** — a die roll repeats, and a button that hands you
  the same exercise twice running reads as broken: eight presses on a
  four-exercise muscle returned three distinct videos. It deals from a bag
  instead, so every exercise comes up once before any comes up twice, and a
  refill that would open on what just played steps aside one place so the seam
  between bags can't repeat either. Changing muscle deals fresh. Verified in a
  browser: 12/12 distinct across each of two cycles on biceps, 4/4 across each
  of three on neck, no back-to-back repeat anywhere in 40 presses.
- **The body turns on its own, and the Display panel is gone** — auto-rotate
  was a checkbox behind a panel, so the back of the model was reachable only by
  someone who went looking for the switch. Turning by default shows there is a
  back without anyone being told; dragging still overrides it mid-turn. Held
  still under `prefers-reduced-motion`, watched live rather than read once. The
  panel held nothing else, so it and its toolbar button went with it.
- **No language picker** — the device decides, and only the device.
  `navigator.languages` is negotiated on load and a `languagechange` event
  re-runs it without a reload. A saved preference from the old picker is
  cleared on next load rather than silently outvoting the phone. The trade,
  stated plainly: someone whose device language isn't the one they'd rather
  read has no override here, and changes it on the device instead.
- **The theme button is an icon** — which of three states you're in is a
  glance, and the label beside it was the longest thing in the header in half
  the languages. `aria-label` and `title` still say what it does and what it
  will do next, so nothing is lost to a screen reader or a mouse — only width.
- **The model is visible on a phone again** — the picker floated over the
  canvas at every width, which at 390px covered 44% of the screen and at 320px
  left one arm and a pair of legs showing. Below 720px choosing a muscle closes
  it, since it otherwise hid the muscle just chosen, and the toolbar button
  brings it back. Tapping outside dismisses. Desktop is unchanged.
- **The muscle list stays on screen on a phone** — closing it by default left
  the canvas looking empty with nothing obviously to do. It is docked on the
  right again, and the body steps aside and scales to fit the space that
  remains rather than hiding behind it. The fit now comes from the model's own
  bounding box, because the same body fills a quarter of a desktop's width and
  four fifths of a phone's, so no single constant suits both.
- **The body moves out from behind the exercise sheet** — opening a muscle on a
  phone put the sheet over the lower half of the canvas, hiding the legs. The
  model now lifts by half of what is covered and scales to fit the band that's
  left, settling back when the sheet closes. Coverage is measured, not assumed,
  since the sheet is shorter for a muscle with four exercises than for one with
  twelve. Moving the model rather than the camera keeps orbit and zoom entirely
  the reader's. Before, the legs and feet were behind the sheet; after, the
  whole body clears it with 22px to spare above the head at 390px.
- **Exercise names wrap instead of truncating** — at every width, desktop
  included, "Isometric Neck Exercise - Sides" was cut to *Isometric Neck
  Exerci…*; names have no useful prefix and the translations run longer still.
- **The canvas says it is loading** — the 1.1 MB model left an empty stage with
  no indication anything was happening (`Suspense fallback={null}`). The
  overlay clears the moment the body is painted.
- **Header fits a narrow screen** — the greeting wrapped to nine lines and took
  nearly half a 320px viewport before the model got any; it keeps one line now.
  That also settled a 1px sideways scroll at that width.
- **Screenshots regenerated**, and `docs/screenshots/capture.mjs` now waits on
  structural selectors — "Muscle Groups" labels the phone toolbar button too,
  so the old text selector matched a hidden element and hung.
- **Light / dark / device** [#6, #9] — one button cycling the three, remembered
  across visits, with the 3D scene colours following the resolved theme.
- **Distinct muscle colours** [#6] — a colour per muscle rather than per region,
  which had made a whole limb read as one mass.
- **GitHub Pages** [#6] — static deploy on every push to `main`.

## Phase 1

- **Body explorer** [#1, #2, #3] — onboarding (name, sex, age band) into an
  interactive 3D anatomical model with a per-muscle detail panel and Train
  action, on a CC0 fused-mesh model.
