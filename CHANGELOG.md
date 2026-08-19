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
- **All 180 have a video again, without lowering the bar** — the closest
  acceptable candidate now wins rather than the first one, since the gate only
  says whether a video is *acceptable* and taking the earliest threw away better
  matches in the same result set. Synonyms taught (a reverse calf raise is a
  *tibialis* raise), and one word waived for one exercise on measured evidence:
  a cable kickback has no two-legged version, so twenty candidate titles across
  two searches contained no "one" or "single". The waiver is per exercise, so
  "Dumbbell One-Arm Upright Row" still refuses a two-arm video. A `SEARCH_AS`
  query is also used verbatim now: the "exercise proper form" suffix helps a
  bare exercise name and drowns an already-specific one.
- **179 of 180 had a video** — five of the six that the contradiction rules
  had left on a search link came back once the resolver was taught what those
  movements are actually called. The catalogue says "Suspended Row" and the
  world says *TRX row*, so a literal search returned barbell rows; `SEARCH_AS`
  changes the question only, and the answer is still judged against the real
  name by the same gate, so it cannot admit a worse video. "alternating" also
  left the strong-word list — reverse changes a movement, alternating only says
  which side goes first. The last one, "One-Legged Cable Kickback", stays on the
  search link and should: it needs a title saying *one* or *single* and nobody
  writes it, because the movement is one-legged by nature, and bending the gate
  for it would cost more than the video is worth.
- **174 of 180 had a video, down from 180** — and that is the rule working,
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

- **Hands stop taking the forearm's colour** — selecting Forearm used to light
  the hands too, since "fore" and "hand" were painted as one continuous,
  unbordered patch and the code cutting them apart had two bugs at once. The
  cut sat at a guessed height (`0.46`) that actually bisected the palm rather
  than finding the wrist; whatever "hand" the guess did carve free was then
  folded back into "fore" by the rule that gives a small minority label back
  to the majority, since "hand" wasn't on the short list of landmark cuts that
  rule is meant to leave alone. `2-name-muscles.py` now measures the wrist
  properly — the arm's own radial width, taken from each height band's own
  centre rather than the body's, bottoms out at f=0.565, not 0.46 — and
  exempts "hand" from the minority fold. Verified by rendering the corrected
  zone map against the model by eye (five fingers, a clean wrist line, nothing
  else in the body touched) and by `check-symmetry.py`: "hand" is now 3.18%
  of body surface at 1.59%/1.59% left/right with 0.1% mirror mismatch — one of
  the best-agreeing zones in the model, not the near-empty one it was.
  Confirmed live in the app: selecting Forearm now stops cleanly at the wrist
  on both arms.
- **Forearm no longer lights part of the thigh** — the arms hang beside the
  legs, and region growing crossed the gap: 127 faces on the upper thighs were
  labelled "forearm", and a further 87 were labelled "hand" while the real
  hands ended up as forearm. `5-despeckle-zones.py` finds both from geometry —
  an island far from the muscle it names, or a zone too small to be a muscle
  and in scattered pieces — and folds each patch into the surface around it.
  Mirror disagreement **improves from 0.76% to 0.73%**, since the strays were
  themselves a source of it. The 127/87 split above predates the fix in the
  entry above this one: now that hand and forearm are correctly two zones,
  the same underlying stray geometry surfaces as ~230 misplaced "hand" faces
  instead of a mix of both wrong names — see
  `tools/muscle-segmentation/README.md`'s Strays section for the current
  numbers.

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

- **Warm-up sets, ramped to the working weight** — before the first working
  set of a barbell exercise, `SetLogger` now shows a ramp: 40% × 5, 60% × 5,
  80% × 3 of whatever weight is in the field, a widely used rule of thumb
  (checked against a documented calculator's scheme rather than recalled —
  see `warmupSets()` in `progression.ts`) rather than a derived formula.
  Purely informational — it is a ramp to read and do, not a set with an "add"
  button, since logging one as though it were a real work set would put
  something into the log that never happened. Scoped to barbell equipment
  only, same line the app already draws for plate-loading math and
  `RELATED_TO`; shown only before the first set logged today for that
  exercise, since by the second set you are already warm. A tier that would
  ask for less than the bar is dropped rather than shown as an unloadable
  number, a tier that rounds up to the working weight itself is dropped too
  (a "warm-up" identical to the work set is not one), and two tiers that
  round to the same loadable weight collapse into one. Verified with new unit
  tests for the tiering and its edge cases, and a new Playwright spec
  (`warmup.spec.ts`) confirming the ramp appears for a typed working weight,
  disappears the moment a set is logged, and shows nothing for a weight
  already close to the bar.
- **A rest timer between sets** — logging a set now starts a countdown, tiered
  by how many reps it asked for (five and under: 180 seconds; up to twelve: 90;
  above that: 60) — a rule of thumb, not a formula, documented as such next to
  `restSeconds()` in `progression.ts`. One timer for the whole workout rather
  than one per exercise, since logging a set always means moving on to the
  next thing: whichever exercise was most recently logged for owns it, and a
  new set anywhere replaces whatever was left of the last one. Tracked as an
  end timestamp rather than a counting-down number in `useRestTimer.ts`
  specifically because a backgrounded mobile tab throttles `setInterval` — the
  number on screen is recomputed from the clock on every tick, so it reads
  correctly the moment the tab wakes up regardless of how long it was actually
  asleep. In memory only, unlike everything else in the app: a rest period is
  a minute or two, and losing it on a reload costs nothing worth persisting.
  Non-blocking — the "Add set" form stays usable the whole time — with a +15s
  extend and a skip, and a generated tone plus `navigator.vibrate()` when it
  runs out, both best-effort and silently skipped wherever unsupported (an
  autoplay policy, iOS Safari's missing `vibrate`). New prop names on
  `SetLogger` (`restTimer`, `onRestTimerSkip`, `onRestTimerExtend`)
  deliberately avoid the existing `onSkipRest`, which already means something
  unrelated: skipping the remaining planned sets, not a countdown. Verified
  with new unit tests for `restSeconds`'s tiers and a new Playwright spec
  (`rest-timer.spec.ts`) covering the tiering, skip, extend, timer replacement
  on a fresh set, and that the form stays usable throughout.
- **A known max now changes its own lift, in every plan that names it, not
  only a related one.** `prescribe()`'s `knownMax` lookup was only ever
  consulted for `RELATED_TO`'s two entries (Incline Bench, Close-Grip
  Bench) — typing a Squat max into the stats page changed nothing about the
  Squat entries themselves anywhere, in any plan, until a real set got
  logged. The one lift the number was actually about was the one place it
  had no effect. `prescribe()` now checks `knownMax(exerciseId)` for the
  lift being prescribed first, with its own `"knownMax"` source and note
  (`plans.from.knownMax`, `plans.knownMaxNote`) distinct from `relatedLift`
  — a real max on this exact lift that hasn't been logged here yet, not a
  borrowed one. Automatic re-adjustment as more data comes in needed no new
  plumbing: `logged` is still checked first and still wins outright, so the
  moment a real set exists for a lift, its estimate — not the typed max —
  takes over, exactly as it already did for every other prescription
  source. Verified with new unit tests (checks the same fix across every
  plan template that names `Barbell_Squat`, not just one) and an extended
  Playwright spec confirming the flat Bench Press row itself, not only
  Incline Bench, switches to the known max in a live plan preview.
- **Forgot password, change password, change email** — the account panel
  could sign in, sign up and sign out, and nothing else; anyone who forgot a
  password had no way back into their own account. A "Forgot password?" link
  on the sign-in form sends Supabase's own reset email
  (`resetPasswordForEmail`), landing back on the app with a real, working
  session — which is exactly the trap: without handling it specially, the
  app's own redirect-once-signed-in effects would read that session as an
  ordinary sign-in and carry the reader straight past the one screen the
  link existed to reach. `useAuth.ts` now catches Supabase's
  `PASSWORD_RECOVERY` event (fired once, the moment the link resolves) as a
  `recovery` flag; `Onboarding.tsx`'s two redirect effects both check it
  before firing, and a third effect opens the account panel automatically
  so there's somewhere for the resulting "set a new password" form to
  appear. Signed-in readers get the same two actions directly in the panel
  — change password and change email, each its own small section reusing
  the stats panel's `.stats-section`/`.stats-edit` styling rather than
  inventing a second form language. An email change goes through Supabase's
  "secure email change" (on by default): a confirmation link to the new
  address before anything actually changes, plus a notice to the old one,
  so a stolen session alone can't quietly redirect an account's mail.
  Verified as far as a live Supabase project isn't available to verify
  against: `tsc -b` clean, and a full click-through against a temporary
  fake project config (`.env.local`, never committed) with a hand-crafted
  session written into `localStorage` to reach the signed-in view without a
  real backend — every new form state renders correctly, including the
  genuine `auth.error` display when the fake project's network calls fail
  as expected. The actual email delivery and recovery-link round trip need
  a live project and are for the reader to confirm.
- **A stats page: body weight, a max for each of the three big lifts, and a
  chart per number** — a new panel in the header, next to Equipment, with
  four sections (body weight, Squat, Bench, Deadlift), each an editable
  current value and a hand-rolled SVG line chart of it over time. Body
  weight was only ever set once, at onboarding — `profile.bodyWeight` stays
  the single current value everything else already reads, and a new
  append-only history (`useBodyWeightLog.ts`) records a dated entry every
  time this panel saves a new one, purely to draw the chart; nothing is
  back-dated for a profile that predates this. A lift's max is `useKnownMax.ts`
  — deliberately not `useTrainingMax.ts`, whose number is a 5/3/1 *training*
  max kept at 90% of a real one on purpose (`TRAINING_MAX_FRACTION`); a
  lifter typing "my max squat" means the real number, and the two would
  collide if shared. Auto-populated from the log (`bestEstimate`, the same
  helper `ProgressionPanel` already uses) when there's history, and — unlike
  the 5/3/1 planner, which refuses a typed-in max on principle since it
  drives eight weeks of percentages — directly editable even with nothing
  logged at all: closer to the trust an onboarding body-weight field already
  extends than to a calculation, and says so, the same way a `Prescription`'s
  `source` already does. Charts are genuinely hand-rolled inline SVG, no
  charting library, in keeping with the bundle-size work earlier this
  session; a single accent-coloured line each, since the app has exactly one
  accent colour and four of these sit in one panel already labelled by
  section.
  - **A known max now nudges a close barbell relative's starting weight, not
    just its own lift.** `plans.ts` gains `RELATED_TO`, a short, hand-picked
    table (Incline Bench Press and Close-Grip Bench Press, both anchored on
    flat Bench Press, both at 0.8× — the ratio the existing `BODY_FRACTION`
    table already implied between them, made explicit rather than invented
    twice) and `prescribe()` gains an optional `knownMax` lookup. Squat and
    Deadlift have no entries: nothing in the catalogue is both barbell-
    equipped and a close enough relative to extrapolate from with the same
    confidence, and the table stays exactly as short as the evidence
    supports — "100 kg bench doesn't mean it can be done with dumbbells" was
    the standing instruction, so equipment always has to match, not just
    the muscle. A new `relatedLift` source sits between `logged` and
    `bodyweight` in how much the panel trusts it, with its own explanatory
    note (`plans.relatedNote`) distinct from the body-weight one — "from a
    real max on a different lift" is a different claim from "a population
    average," and showing the wrong explanation would be worse than showing
    none. Every existing `prescribe()` call site and test keeps working
    unmodified, since `knownMax` is optional and only ever consulted for the
    two ids in `RELATED_TO`.
  - **Fixed a stale line while in the neighbourhood**: `plans.startingNote`
    still said the body-weight guess came from "body weight, age and sex" in
    all ten locales, long after the `gender` field itself was removed from
    the calculation. Corrected to "body weight and age" everywhere, since
    the note is meant to say what the calculation actually does.
  - Both new tables (`known_maxes`, `body_weight_log`,
    `migrations/0004_stats.sql`) sync like their nearest existing analogue —
    last-write-wins per lift like `training_maxes`, union-by-id like `sets`
    — but unlike every migration before it, this one is genuinely optional
    to defer: nothing existing writes to these tables, only this new panel
    does, so `sync.ts` queries and pushes them separately from the four core
    tables specifically so a missing-relation error there can't take down
    set, programme or profile syncing with it.
  - Verified end to end: unit tests for `RELATED_TO`'s scaling and its
    boundary (never fires outside its two ids, never overrides this
    exercise's own log), two new Playwright specs (a max set by hand with no
    log shows the right note and no revert button; a known Bench Press max
    correctly nudges Incline Bench Press's preview to 55 kg with a "from
    Barbell Bench Press" label), and a live browser check of the same
    end-to-end path with a screenshot at each step.
- **`apps/web/src/lib/api.ts` removed** — a client for `apps/api`'s
  `/api/muscle-groups` endpoint, imported nowhere; the viewer has read
  `src/anatomy/muscle-map.json` directly since well before this was written.
  Took the `MuscleGroup` type in `types.ts` with it (its only reader) and
  `VITE_API_URL` out of `.env.example` (its only reader). `apps/api` itself
  and `data/muscle-groups.json` are untouched — the API still serves that
  data from its own seed, this only removes the web app's dead client for
  it.
- **An end-to-end smoke suite, so a redirect or a splash timing breaking
  silently stops being how these get found.** Two changes in a row this
  session (the lazy-loaded explorer, then the splash showing on every visit)
  were checked by hand with a throwaway Playwright script written fresh each
  time — useful once, gone afterwards. `apps/web/e2e/*.spec.ts`
  (`@playwright/test`, `npm run test:e2e -w apps/web`, wired into
  `npm run check`) makes that permanent instead: five tests, run against a
  production `vite preview` build rather than the dev server, since dev's
  unbundled modules don't reflect what a visitor's browser actually does.
  Covers a new visitor's full splash-then-form-then-explorer path, the
  disabled-until-answered Continue button, a returning visitor's quick
  bar-less splash (profile seeded straight into `localStorage` to skip the
  form), the plan library opening with cards, and an equipment chip
  surviving a close-and-reopen. Sanity-checked the suite itself before
  trusting it: broke the equipment chip's selected-class logic on purpose,
  confirmed the relevant test actually failed, then reverted. Local-only for
  now, not gated in CI — matches how the rest of `npm run check` already
  works, run before pushing rather than after. `vite.config.ts` gained a
  `test.exclude` for `e2e/**` so vitest's own default include pattern
  doesn't try to run Playwright's spec files as unit tests.
- **The 3D model no longer loads before the welcome screen does.**
  `BodyExplorer` — Three.js, `@react-three/fiber`, `@react-three/drei` and
  the rest of the anatomy viewer's dependency tree, together ~63% of the
  app's JS — used to ship in the same bundle as Onboarding, so a first-time
  visitor's browser downloaded and parsed the entire 3D engine before the
  form asking for a username ever painted. `App.tsx` now loads
  `BodyExplorer` behind `React.lazy()` instead of a static import, splitting
  it into its own chunk that only fetches when a route actually needs it.
  Onboarding's own chunk dropped from 1,546.74 kB to 472.46 kB (gzip:
  421.70 kB → 129.10 kB); the split-off `BodyExplorer` chunk is 1,074.57 kB
  (gzip: 293.04 kB) and no longer on the critical path for first paint.
  Since everyone reaches `/explore` sooner or later — filling in the form
  or hitting one of Onboarding's two redirects for a returning visitor —
  Onboarding also fires a background `import("./BodyExplorer")` the moment
  it mounts, so the chunk is already warm by the time Continue is pressed
  rather than adding a second wait after it.
- **Equipment: what's actually available, prioritising exercise lists and
  training-pair suggestions around it** — a new panel in the header, next to
  Account and History, where the reader picks from barbell, dumbbell,
  machine, cable, kettlebells, bands and exercise ball. Nothing selected
  means no preference, and every list renders exactly as it always has;
  that's deliberate, since this is meant to be flipped back and forth as a
  gym-goer trains at home some days, not answered once at onboarding and
  forgotten. `equipment` on `Profile` is a fixed list read straight from the
  catalogue's own equipment tags rather than a second list to keep in sync —
  "other" is left out on purpose, since it's the catalogue's grab-bag for
  sleds, wrist rollers and suspension trainers, no two of which are the same
  purchase, so a single checkbox for it would claim access to gear a "yes"
  was never actually about.
  - **The muscle exercise list reorders, never hides.** A stable sort brings
    matching exercises (plus anything body-only, which needs nothing and
    always counts as available) to the top and leaves everything else
    exactly where it was — a machine-only reader still *sees* the barbell
    row they could ask a gym neighbour to spot, which a filter would have
    taken away along with the ones they can't do.
  - **Training-pair suggestions get the same input, and it took a second
    pass to actually matter.** First version added `equipmentAvailable` as a
    scoring bonus below "no extra kit" — body-only, needing nothing, always
    outranked it, and every exercise and region has at least three legal
    body-only candidates, so it filled all three visible slots regardless of
    what was picked. Checked against all 180 exercises: zero suggestions
    changed. Fixed by tying rather than ranking: body-only, the exact
    equipment you're already at, and equipment you said you have are now one
    "can do it next" tier, not three descending ones — a bodyweight move and
    a lift on your own gear are equally real answers to "what's my
    rest-break partner" once you've actually stated what you have. Verified
    the fix the same way the bug was found: kettlebells now changes the
    suggestion for 25 of 180 exercises, dumbbell for 87, barbell for 127.
    `check-pairs.mjs`'s guarantees are untouched — this only reorders within
    the already-legal set.
  - The Supabase side needs `migrations/0003_equipment.sql` applied — unlike
    the gender-drop migration, this one is not optional to defer:
    `profileToRow` now sends an `equipment` key on every profile upsert, so
    until the column exists, syncing a profile fails outright for anyone
    signed in (caught by the existing error handling, not a crash, but sync
    silently stops working until it's run).
- **The splash now shows on every visit, not just a stranger's first one** —
  a returning visitor (a saved profile, or a session already signed in) used
  to skip it outright and land straight on `/explore`; now they get it too,
  in a quick, bar-less form (`quick` on `Splash`): the mark and tagline still
  fade in, but there's no progress bar (nothing's actually loading for
  someone Onboarding already knows), and the hold-then-fade drops from
  0.9s + 0.5s to 0.25s + 0.25s so it reads as a flash of the brand in passing
  rather than a second loading screen. The two redirects (account, or a
  device profile) now wait on the splash reaching "done" instead of firing
  the instant `profile`/`auth.session` resolve — previously that race is
  exactly what kept a returning visitor from ever seeing the splash start.
  Browser-verified against a production build both ways: a fresh visitor
  still gets the full 1.4s version with its bar, a returning one gets the
  quick flash and reaches `/explore` in ~550ms, matching the shortened
  timers, with the 3D canvas rendering normally either way.
- **A splash, shown once, to someone Onboarding has just confirmed is new**
  — the bolt beside the wordmark and a "Train smarter" tagline underneath,
  a thin bar filling at the bottom while it holds, faded into the welcome
  form after 0.9s over a 0.5s transition. Same path data as `Logo`, not
  copy-pasted, scaled up rather than redrawn; same colour convention too —
  the bolt takes `--accent` with a soft glow, "Guide" sits in `--text-muted`,
  "Train" in `--text` — all already theme-aware, so it reads correctly in
  light or dark without any logic of its own. The tagline is a real
  translation key across all ten locales, not hard-coded English. The timing
  only starts once a returning visitor's two redirects (an account, or a
  profile already on the device — see below) have had their chance to fire
  instead: `profile` is known synchronously, so that risk was never real, but
  `auth.loading` is not, and starting the animation for someone about to be
  sent straight to the explorer a moment later would have been worse than
  never adding it. Skipped entirely under `prefers-reduced-motion: reduce`.
  Browser-verified in both themes, mid-fade, and with reduced motion forced,
  where it never renders at all.
- **Onboarding no longer reshows itself to someone it already knows, and
  drops a stat nobody was evaluating the app by** — two small fixes to the
  welcome screen. First, `/` rendered onboarding unconditionally, with no
  check for a profile already sitting in `localStorage`: a new tab, a
  bookmark, a PWA relaunch all meant re-answering three questions `useProfile`
  already had the answer to before the first paint. A redirect-once-known
  effect fixes it, the same shape as the redirect-once-signed-in one added
  last time — both now sit side by side, one for an account, one for a device
  that never needed one. Second, the "10 languages" stat pill is gone: it was
  never something a visitor evaluates their own use of the app by, true
  regardless of which language they're reading it in and invisible to them
  either way, unlike the muscle and exercise counts next to it. The unused
  `onboarding.statLanguages` key is removed from all ten locale files rather
  than left unread. Full gate green. Browser-verified: a fresh visitor sees
  two stat pills instead of three; a visitor with a saved local profile
  loading the bare root URL lands on the explorer directly, with the
  onboarding form never rendering at all.
- **The sex picker is gone from onboarding** — nothing else in the app ever
  read it. Its one job was `SEX_FACTOR` in `prescribe()`, cutting the
  starting-weight guess by 32% for "female" and "other" and leaving it full
  for "male"; "other" was already defined as taking the more conservative of
  the two figures, on the reasoning that of the two ways a starting-point
  guess can be wrong, starting light is the recoverable one for anybody. That
  reasoning never depended on which figure a person picked, so every profile
  now gets the conservative fraction — `CONSERVATIVE_FACTOR = 0.68`, applied
  unconditionally where `SEX_FACTOR` used to be looked up. Onboarding is
  three questions instead of four. `Profile.gender` and the `Gender` type are
  gone from the app entirely rather than left unused; `lib/sync.ts` stops
  reading and writing the column but the database schema needs a separate,
  optional step — `supabase/migrations/0002_drop_gender.sql` drops it
  whenever it's convenient to run; nothing breaks before that, an unused
  nullable column is just dead weight. Full gate green (36 tests, one
  rewritten to assert every profile gets the same fraction rather than
  asserting a scaling relationship that no longer exists). Browser-verified:
  onboarding shows only username, body weight and age group, the continue
  button enables on three answers instead of four, and a plan preview's
  starting weights are lower across the board and still respect the empty-bar
  floor.
- **Body part split now offers a 4-day variant alongside its original 5** —
  the one plan in the library where day count wasn't free to change: the other
  six are all rotations, where training one more or less often just changes
  how frequently the same days repeat, but body part split's days *are* the
  muscle groups, so a shorter week has to actually combine two of them rather
  than visit all five less often. The new 4-day version merges shoulders and
  arms into one session with the volume trimmed to fit — four exercises
  instead of six, not the two days concatenated. `PlanTemplate` now holds a
  `variants` array instead of a single day list; every other plan still has
  exactly one entry, and a new test asserts that stays true, so a future plan
  doesn't grow a pointless selector by accident. A "days a week" chip picker
  appears on the preview screen only when there's more than one variant to
  choose from, defaulting to the fuller original rather than surprising
  anyone who already knew this plan as five days.
- **The sign-up confirmation email now links to the real domain** — it was
  landing on `localhost:3000`, unreachable from anywhere but the machine that
  built the app, because `signUp` never set `emailRedirectTo` and Supabase
  falls back to the project's Site URL, which defaults to `localhost:3000`
  and has to be changed by hand in the dashboard. The link now targets the
  app's own origin explicitly rather than depending on that dashboard field
  being right. Deliberately the bare origin rather than `#/explore` directly:
  the confirmation carries a PKCE code as a real query parameter, and rather
  than guess how Supabase combines a query string with a URL that already has
  a hash, it lands on `/` and lets onboarding's own redirect-once-signed-in
  effect (below) carry it the rest of the way. The dashboard's Site URL and
  Redirect URLs still need to be updated separately — this only removes the
  code's dependence on that being done right.
- **Sign in before onboarding, not only after** — the account button now also
  appears on the welcome screen, before any of the four profile questions are
  answered. Previously the only way in was to fill them out first: onboarding
  routed unconditionally, with no check for an existing profile and no way to
  reach the account panel except through it, so a returning user on a new
  device had to type a username, sex, age and body weight it was about to
  throw away — `mergeOnSignIn` already preferred the real profile over
  whatever was typed locally, so the answers were discarded within a second of
  signing in, but the person still had to produce them first. Signing in here
  now redirects straight to the explorer once a session exists, and
  `BodyExplorer` runs the same merge again on arrival — `mergeOnSignIn` was
  already safe to call twice, so this needed no new sync logic, only a second
  place to open the same panel and a redirect once the session says who they
  are.
- **Three more plans, chosen by what equipment and time a person actually
  has rather than by goal** — a dumbbell-only full body for a home gym with no
  barbell or rack, a minimal two-day-a-week shape for whoever really only has
  two sessions, and a bodyweight-only plan for a hotel room or a start with
  nothing. The last needed a real distinction the code hadn't made before:
  `prescribe` had exactly one non-logged path, body weight times a
  per-exercise fraction adjusted for sex and age, and a push-up isn't that —
  its load *is* the full body weight, unscaled, because a 60-year-old and a
  25-year-old at the same weight do the same push-up against the same
  resistance. A `"body only"` reading from the catalogue (parallel to the
  barbell floor's own reading) now short-circuits straight to body weight
  before the fraction table is ever consulted, under its own `atBodyWeight`
  source rather than being folded into `"bodyweight"` and dressed up as an
  estimate it isn't. The dumbbell plan reuses the same per-hand convention the
  logger already applies to `Dumbbell_Bench_Press`, confirmed against the
  catalogue's own instructions rather than assumed for the three new
  exercises. One rendering bug caught before it shipped: the "weights marked
  starting point" note is fixed text below every plan preview, and would have
  explained a label that never appears on a plan built entirely from logged
  lifts or body-only exercises — it now only renders when something on screen
  actually says "starting point".
- **A fourth ready-made plan: body part split** — chest, back, legs, shoulders
  and arms across five days, one muscle group a session instead of the two or
  three a week the other three shapes give it. Eight new exercises needed a
  starting-weight fraction each, set by analogy to a lift already in the
  table rather than picked fresh — incline and close-grip bench sit a shade
  under flat bench, a one-arm row is braced against a bench and so moves more
  per hand than a press, `Face_Pull` is a light high-rep accessory nobody
  loads heavy. `check-plans` passed all 60 synthetic profiles on the first
  run — the barbell floor and equipment-read fixes from the original three
  plans already cover a plan added later.
- **Sign-in and sync, wired but waiting on a project** — the four hooks
  (`useLog`, `usePrograms`, `useTrainingMax`, `useProfile`) now write through
  one seam in `lib/storage.ts` instead of calling `localStorage` directly, and
  listen for writes they did not make themselves — which is what lets a sync
  pull update the screen without a reload. `useSync` merges local and remote on
  sign-in (local written first, so a flaky connection cannot leave the device
  worse off) and pushes on every later change, debounced. The account panel
  only appears once a Supabase project is configured; with none, which is the
  state everyone is in until the keys exist, the app is exactly what it was
  before this. Not yet exercised against a real project.
- **Google sign-in, built and proven as far as it can be without a live
  provider** — flowType set to `pkce` rather than the library default of
  `implicit`, because implicit returns the session in a URL fragment
  (`#access_token=...`), which would fight the app's own hash routing for the
  same part of the URL. Verified against auth-js's source rather than assumed:
  the code exchange only ever touches `url.searchParams`, never `url.hash`.
  Confirmed by intercepting the real authorize request the app builds — PKCE
  parameters present, redirect target correct. Providers start off
  (`ENABLED_OAUTH_PROVIDERS`) until proven working end to end in a real
  browser, which needs credentials only a person can create.
- **Live at guidetrain.me** — off `defsix.github.io/guidetrain/`, which now
  301-redirects, so old links keep working. Two pieces make it hold:
  `apps/web/public/CNAME` ships inside `dist/`, because an Actions deploy
  re-applies the Pages configuration from the artifact and one without that
  file silently drops the custom domain on a later push; and the build stopped
  passing `--base=/guidetrain/`, which at a domain root would have every asset
  requesting `/guidetrain/assets/…` and load a blank page rather than a 404.
  Local data did not survive the origin change — `localStorage` does not follow
  a redirect — which was the known cost of moving before accounts.
- **The Supabase schema and its policies** — `supabase/migrations/0001_accounts.sql`
  plus `tools/supabase/check-rls.mjs`, which proves the row-level security holds
  by attacking it with a second account rather than asserting it. Not wired into
  the app yet.
- **What to do when the cycle doesn't go up** — the plan described success and
  nothing else, which the README had already named as the part that gets
  somebody hurt. It now marks each week's top set hit or missed against the log,
  and when a lift stalls it offers Wendler's answer: 10% off that lift's
  training max, rebuild. The reset is stored per exercise, since a training max
  derived from your best set would otherwise climb straight back. Two things the
  browser found that the reasoning hadn't: the seed set was marking its own
  cycle (a 140 kg five puts week three's top set at 140 kg), so only work logged
  since the training max was fixed now counts; and with a reset active the panel
  still claimed the number was "90% of the estimate" one line above the note
  saying it wasn't.
- **History** — every set has been stored since logging shipped and none of it
  was ever shown. Now readable by day, for what you did on Tuesday, and by
  exercise, for whether a lift is going anywhere. On the device, like the rest.
- **Unit tests, at last** — 34 of them over the arithmetic that decides what
  goes on a bar: Epley's edge at one rep, the 5/3/1 percentages and reset, the
  plate walk including a weight the rack cannot make, and the plan
  prescriptions. Expected values worked by hand from the sources rather than
  captured from a passing run — two failed first time because my arithmetic had
  forgotten the loads get rounded to something loadable. `npm run check` runs
  them alongside the three data gates and the build.
- **What the number on screen actually means** — it differed by equipment and
  the app never said which. A barbell's 100 kg is the whole loaded bar, so it
  now shows the 40 kg a side and the plates to build it from — the halving is
  where people slip, and 20 kg reads "just the bar" rather than an empty plate
  list. A dumbbell's 12.5 kg is one hand, which read as the pair would halve
  the work, so dumbbell rows say "per hand" in both the logger and the plan
  preview. The plates follow the weight in the field, so it answers for a
  number you typed as well as one you were handed, and says nothing at all for
  a total that cannot be made from the rack.
- **The plate walk needs no rounding, and rounding it was a bug** — the first
  version guarded each subtraction against a floating-point residue, on the
  claim that `47.5 - 25 - 20` drifts off 2.5. It does not: every plate and every
  total the app produces is a dyadic rational, so the arithmetic is exact. The
  guard was not merely idle — rounding to two decimals rounded a real miss away
  too, and a typed 100.001 kg came back loadable with plates adding to 100.
  Removed, with the exactness checked over every reachable total rather than
  asserted.
- **The weights follow you to the bar** — both planners worked out what to lift
  and then let the number die on the screen that computed it: a plan previewed
  "Barbell Squat 40 kg" and applied as a bare "3 × 5", and the 5/3/1 table left
  you to carry three numbers to a rack from memory. Each now writes its
  prescription into the workout target, and the logger offers it back one set at
  a time with the field already filled. Targets therefore gained per-set steps,
  since sets and reps alone cannot describe a 5/3/1 week — 5, 3 and 1 at three
  loads. Hand-editing a target drops the weights rather than keeping them
  against new rep counts, and says so first. Nothing here records anything:
  prescribing 75 kg is not a claim that 75 kg was lifted.
- **A bigger panel, instructions, skipping, and the next workout** — four
  things the workout screen was missing. It now runs nearly full height on a
  phone and 720px on a desktop instead of 380; the tab row had been silently
  crushed to a few pixels of blank pills, because flex children shrink by
  default and the panel is a scrolling column, so its children now hold their
  height. Each exercise carries its written instructions, collapsed. A set or
  the rest of an exercise can be skipped, which advances the prescription and
  writes nothing to the log — a skipped set is shown hollow and dashed, never as
  a filled pip, because it is the opposite claim from a set you did. Finishing
  every target offers the next workout by name, and says so plainly when that
  was the last one in the plan.
- **`check-plans` actually checks the floor now** — it had said the
  starting-weight rule "cannot be checked from here", which was simply wrong:
  `tsx` was in the tree the whole time. It imports the real module, checks 60
  profiles, and fails on the empty-bar bug when that is reintroduced.
  `npm run check` runs all four gates.
- **Ready-made plans, with the weights to actually use** — three well-worn
  shapes (full body, upper/lower, push/pull/legs), previewed with real loads and
  added as named workouts with their targets already set. Where a lift has been
  logged the weight is a calculation from it: best set through Epley, backed off
  a tenth to something finishable. Where it has not, it is body weight times a
  per-exercise fraction adjusted by sex and age band — a population average,
  labelled "starting point" rather than dressed up as a prediction, and light on
  purpose, since a set that turns out easy costs one set and a set that turns out
  heavy costs a back. What it deliberately will not do is derive a one-rep max
  from demographics: that number drives the 5/3/1 planner and has to come from a
  set that happened. Barbell lifts floor at the empty 20 kg bar, read from the
  catalogue's equipment field — asking the id whether it began with "Barbell"
  was true of `Barbell_Squat` and false of `Standing_Military_Press`, and told a
  60 kg profile to press 7.5 kg. `tools/exercises/check-plans.mjs` fails if a
  plan names an exercise the catalogue lacks, which had already happened once.
- **The plan shows every cycle, and says why the weeks climb slowly** — it
  promised "2 cycles, about 8 weeks" above a four-row table and never mentioned
  that the four weeks repeat at a higher training max. They can now be stepped
  through, and two notes answer what the table provoked: the weekly jumps are
  small because every load is a share of the *training* max rather than the
  real one, and the increase comes per cycle.
- **The smallest plate is 1.25 kg, so the bar moves in 2.5 kg steps** — and
  every cycle now moves with it. At 2.5 kg plates the bar stepped 5 kg, which is
  larger than a cycle's increase at the top percentages (5 kg of training max is
  4.75 kg at 95%), so cycles 1 and 2 called for identical weights and the plan
  looked stalled. The training max keeps its own 2.5 kg rounding rather than
  following the plate rack, which would have put it on 1.25 kg boundaries and
  produced figures like 198.75.
- **Repeated cycles are still labelled as repeated** — a heavier plate rack or a
  smaller increment can bring the situation back, and two identical tables look
  like a broken one, so the panel says which cycle repeats and why.
- **Targets you tick off by lifting** — an exercise can carry `3 × 5`, drawn as
  pips beside it, with a line counting finished exercises. The pips fill from
  the log and nothing is tappable to tick: a tick set by hand would be a second
  account of the same session, free to disagree with the sets recorded, and
  then one of the two is wrong and the app cannot say which. Deleting a logged
  set empties a pip again. A fourth set against a target of three draws a
  fourth outlined pip rather than being clamped — it happened, and hiding it
  would put the log and the pips back into disagreement.
- **Named workouts** — several rather than one, switched with a row of tabs:
  new, rename, delete, with delete offered only once there is a second one to
  fall back to. An unnamed workout shows as "Workout 1", numbered by position
  and translated at render, so it reads as *Training 1* in German; storing that
  label would freeze it into whichever language was on when it was made. The
  old single list migrates into the first workout on load and its key is
  removed, so nothing built is lost, and saving an exercise with no workout
  open creates one instead of quietly doing nothing. Caught in verification:
  wiring `create` straight to `onClick` handed it the click event as the name,
  which reached every `name.trim()` downstream — fixed at the call site and
  guarded in the hook.
- **Kilos, everywhere** — the pound option is gone, and with it a whole
  dimension: "best", the estimate and the plan no longer have to ask whether
  two numbers are comparable before comparing them. A log written in pounds is
  converted once on read and written back, rather than left to be read as
  though 225 meant kilos. A profile whose body weight was saved in pounds is
  left alone and asks for the weight instead, since converting it silently
  would show a number nobody entered.
- **One Watch demonstration, not two** — the control under a training pair was
  falling back to a browser default button, bordered and black and twice the
  size of the identical control four lines above it. The rule was scoped to the
  exercise body and missed the pair; both now use the small accent version.
- **Body weight, exact, on the first screen** — a figure to the nearest whole
  unit rather than a band, because unlike age it is arithmetic: it is the load
  on all 29 bodyweight exercises in the catalogue.
- **A push-up asks for reps alone** — its load is the person doing it, so a
  weight field there was a question with one honest answer and one more thing
  to type mid-set. The weight is still recorded, so the set reads `82 kg × 10`
  and counts towards a plan; a line under the field says where the number came
  from. Falls back to asking in the two cases where it cannot know: a profile
  saved before body weight existed, and a body weight held in the other unit,
  since converting silently would show a number nobody entered.
- **Loads assume a 2.5 kg smallest plate, so the bar moves in 5 kg steps** —
  plates go on in pairs, and 87.5 kg is not a weight anyone can build. The
  training max deliberately keeps finer resolution: it is a number to calculate
  from, not a weight to load, and rounding it would drag every percentage below
  it and make the 2.5 kg upper-body increment impossible to apply at all.
- **A training pair opens its instructions, not its video** — first tap shows
  the written steps with the demonstration offered underneath them. It used to
  open the player straight away, answering "show me" before anyone had asked
  "what is it"; between sets, four lines of text cost a moment where a video
  costs the whole rest.
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
