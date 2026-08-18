# Muscle segmentation pipeline

Turns a colour-coded anatomy model into the viewer's `anatomy_*.glb`, where
every vertex carries the muscle it belongs to.

The source model is one fused mesh with each muscle group hand-painted a
distinct colour in its texture. These scripts recover those painted regions as
actual geometry, so the viewer can pick muscles by exact anatomical boundary
instead of approximating each one with a box.

## Running it

Needs `numpy`, `pillow` and `scipy`, plus `meshoptimizer` from the repo's npm
install. Put the source model in this directory as `model.glb`, then:

```bash
python3 check-uv-sampling.py   # sanity check (see "UV convention" below)
python3 1b-denoise.py          # edge-preserving smooth of the colour samples
python3 1-segment.py           # painted colours -> ~110 muscle regions
python3 2-name-muscles.py      # regions -> the app's muscle groups
python3 3-prepare-export.py    # per-vertex zone ids, normalised to viewer scale
node    4-build-glb.mjs        # decimate + write anatomy_mobile/full.glb
python3 5-despeckle-zones.py apps/web/public/models/anatomy_mobile.glb
python3 5-despeckle-zones.py apps/web/public/models/anatomy_full.glb
```

Step 5 removes labels that landed away from the muscle they name — see
"Strays" below. It edits the built `.glb` in place and is a no-op on a clean
one, so it is safe to re-run.

Then, once the result is copied into the app:

```bash
python3 check-symmetry.py      # left/right agreement of the shipped model
python3 palette-adjacency.py   # which muscles touch -> adjacency.json
python3 palette-design.py      # the muscle colours
```

Then copy the two `.glb` files to `apps/web/public/models/` and the generated
`muscle-map.json` to `apps/web/src/anatomy/`.

## How it works

1. **Sample** each triangle at its UV centroid to read the tint it was painted.
   The centroid matters: the atlas is made of thousands of small islands, and a
   vertex UV sits on an island border where JPEG bleed and gutter padding
   contaminate the texel.
2. **Denoise** those samples with an edge-preserving filter — see below. Without
   it the rest cannot work.
3. **Grow** regions by comparing each face against its neighbour in chromaticity
   (`rgb / sum`, which ignores the shading baked into the texture). Shading
   inside a muscle changes gradually and passes; a painted border is a single
   jump and stops growth. Colours repeat across the body, so connectivity is
   what makes a region one muscle — and left/right separate on their own,
   never being connected across the surface.
4. **Fill** the remaining unclaimed surface (shaded edges, tendon, bone) by
   expanding the muscle cores into it until every face is owned.
5. **Group** the resulting patches into the app's muscle groups and bake the
   zone index onto each vertex as the glTF `_ZONE` attribute.

### The painted outline is the border

A region is labelled **as a whole**, not face by face. The patch outlines come
from the colours painted on the model, so they already are the muscle borders;
the rules only get to pick which muscle a region is. Labelling faces
individually and then stitching the results put the seam wherever a threshold
happened to fall, cutting straight across the artwork — that was the bleed
between groups.

Which way a region faces and how far out it sits are therefore read **once for
the whole region**; those are the readings per-face noise ruins. Height is read
**per face**, so a region that spans a landmark is cut at it — see below.

Landmarks found in the mesh keep it honest: the crotch (where the legs merge)
and the sideways reach that separates a limb from the trunk. They constrain the
core connectivity **and** the fill, so a painted region running continuously
from the abdomen onto the thigh can't become one patch. Leftover pockets with no
core to grow from — the pelvis, mostly, which is bone and tendon and carries no
tint — become patches in their own right rather than being swallowed by a
neighbour across a landmark.

Depth is measured against the body's own centre line at each height, taken as
the midpoint of the slice rather than its median (the front of the body is
tessellated much more finely than the back, so a median sits well forward of the
real centre and the back reads as front). The arms get their own centre line,
since they hang behind the trunk's in this pose.

### Which way a region faces, not where its centre is

Front and back are told apart by **how much of a region's surface faces each
way**, not by how far its centre sits from the body's axis. A limb is round, so
a patch lying along the back of the thigh has its centre only just behind the
axis: three of them measured 0.004–0.009 behind, well inside a threshold meant
to catch hamstrings sitting at 0.033, and so came out as quadriceps despite only
a tenth of their surface facing forward. The share facing forward separates the
same patches with room to spare — hamstrings at 0%, quadriceps at 84–100%.

The inner thigh faces neither forward nor back, so the adductors are found by
the share facing the **midline** instead. The one region the model paints there
looks inward over 86% of its area; every other region of the thigh is at 48% or
less. Asking instead for a narrow strip near the midline caught vastus medialis,
which runs just as close but looks forward.

### Where a painted region covers two muscles

Some painted regions cover two muscle groups with no border drawn between them,
and no amount of care about outlines can recover a border that was never drawn:

- One region runs from the lumbar spine to the shoulder blades — **9% of the
  whole body**, erector spinae and trapezius together. The artist used the same
  colour for the trapezius and the lower back, and the two touch along the
  midline, so region-growing fused them.
- Another runs from the collarbone right over the top of the skull.
- The upper arm is painted as one region wrapping round the limb — the largest
  patch there is 47% front and 53% back — so biceps and triceps have no border
  between them either.

Given one reading each, these come out as a single muscle covering both, which
is the same defect as biceps and triceps sharing a patch. So a region is cut
where it spans a landmark, and **only** at a landmark — never at an arbitrary
height. A piece holding less than a sixth of its region is given back to the
majority, so a cut can't leave slivers. The upper arm is the one cut made
front-from-back rather than by height.

Landmarks are measured, never assumed:

| landmark | how it is found | lands at |
| --- | --- | --- |
| crotch | scanning up, surface on the midline jumps as the legs merge | f=0.50 |
| ribs | trunk wins back half the depth it loses at the waist | f=0.66 |
| elbow | thinnest point of the limb between shoulder and wrist | f=0.67 |
| wrist | the arm's own radial width, measured from each height band's own centre, bottoms out below the elbow | f=0.565 |
| throat hollow | the dip in the front surface between the collarbones | f=0.845 |
| chin | where that same surface juts forward again | f=0.875 |

The last two are turning points of one profile. Width works for neither: the
shoulders slope up into the neck so there is no step at the bottom, and this
skull is barely wider than the neck, so a width test reads the whole face as
neck — which it did, until the profile replaced it.

Getting these right is most of the difference between a plausible model and a
wrong one. Before the ribs landmark, erector spinae covered 12% of the body —
the entire back, trapezius included. After, it is 3.8% and sits where it should,
as a lumbar column.

### Denoising, and why it decides everything

A triangle covers only a handful of texels, so a single sample carries the
texture's JPEG artefacts and the fine striations painted along each muscle.
Measured on the raw samples, the colour step between neighbouring faces *inside
one muscle* had a median of 0.018 — about the same size as the step *between*
two adjacent muscles. Quadriceps sample at RGB(190,66,54) and hamstrings at
RGB(210,64,78), a chromaticity gap of 0.059, which the noise almost swallows.
No threshold separates muscles at that signal-to-noise: tighten it and muscles
shatter, loosen it and they merge.

`1b-denoise.py` fixes that before anything else runs. It averages each face with
its neighbours, weighting each by how close its colour already is, so shading and
noise inside a muscle average away while a border — a large jump — is barely
averaged across. Repeating it widens the neighbourhood a face can draw on without
ever bleeding over an edge:

| | inside a muscle | at a border |
| --- | --- | --- |
| before | p50 0.0184, p75 0.0384 | p99 0.2112 |
| after | p50 0.0029, p75 0.0068 | p99 0.2254 |

Noise drops sixfold and borders come out slightly sharper, which leaves a wide
gap to put a threshold in. Growing regions at 0.016 then separates every muscle
group the model distinguishes — including quadriceps from hamstrings, which
before denoising had to be cut geometrically. The threshold sits between the
noise (p75 0.0068) and the closest real border, biceps against triceps at 0.039.

### Symmetry: the model is folded onto itself

Left and right have to be decided together, or one thigh comes out "quadriceps"
and the other "adductors" purely because their centres fell either side of a
threshold. `check-symmetry.py` measures this on the shipped `.glb`: it mirrors
every triangle, finds the triangle nearest that mirrored position, and reports
the surface where the two carry different muscles.

Pairing patches by nearest mirrored centre doesn't work — it matches only 19 of
112, because the two halves aren't segmented identically and the same muscle can
have quite different centres on each side. Matching face by face and joining
each patch to the patch covering most of its mirror image pairs 61 of them, and
that alone takes the disagreement from 13.5% to 5.6%.

The rest is not a labelling problem but a segmentation one: where one side is
painted as a single patch and the other as three, no pairing of whole patches
can agree, which is why the abdomen and flank stayed lopsided (obliques 42%
disagreement, left/right areas differing by 42%). Loosening the pairing to chain
those together only trades the anatomy away — at a fifth coverage, trapezius,
latissimus and erector spinae merge into one region and the number improves for
the wrong reason.

So after joining, each region is **cut along the mirror image of the other
side's borders** — split by which region its mirror lands in. Every unit that
comes out spans both halves of the body and is its own mirror, so one reading
per unit is symmetric by construction. The new cuts aren't arbitrary: each is
the reflection of a border the model was painted with, which is where that
border belongs on the other side. Narrow offcuts left where the two sides differ
only slightly are merged into the neighbour they share the most border with;
the units are their own mirror, so that merge stays symmetric too.

Reading height per face doesn't disturb any of this — height is unchanged by
mirroring, so a landmark cut falls in the same place on both sides.

| | disagreement | surface cut across a painted patch |
| --- | --- | --- |
| join patches to their mirror | 5.56% | 2.4% |
| …then cut along the mirror | 0.19% | 6.2% |

Cutting the raw patches instead of the joined regions reaches the same symmetry
with four times the cutting, because pairs that already agreed get split too.

On the shipped model the figure is 3.3% rather than 0.33%: decimation collapses
edges without regard for the mirror, leaving a one-triangle fringe along every
border. No muscle's left and right areas now differ by more than 3%.

### Smoothing the borders, on the mesh that is drawn

A border is where two painted colours met on a noisy texture, so it arrives as
sawtooth — and decimation then makes every triangle nine times larger, turning
each wobble into a visible spike. Two colours meeting along a ragged edge reads
as the two bleeding into each other rather than meeting at a line.

Smoothing the full-resolution mesh barely helps, because the coarse mesh is
re-cut from it afterwards: the border has to be settled on the triangles that
are actually drawn. So `4-build-glb.mjs` does it after decimating. Each zone
becomes a field that is 1 on its own triangles and 0 elsewhere, and those fields
are blurred across the surface before the winner is read off. A straight
majority vote stalls almost immediately — every triangle already agrees with
most of its neighbours while the border is still sawtooth — whereas blurring
keeps shortening the border for as long as it runs. It also settles the
three-way ties left by decimation, which otherwise resolve by zone number, an
alphabetical accident rather than geometry.

Left and right are decimated to different triangles, so smoothing them
separately lets them drift apart: doing that cost most of the symmetry the
previous pass had won (0.6% → 5.4% disagreement). Each triangle is therefore
paired with the one nearest its own mirrored position and the two are smoothed
as one. That also repairs the asymmetry decimation introduces on its own —
which is why the shipped model now measures 0.73% rather than the 3.3% that was
previously written off as an unavoidable cost of decimating.

### The palette

`palette-design.py` builds the muscle colours; `palette-adjacency.py` works out
which muscles touch on the model, since those are the pairs that can actually be
confused. The colours are checked, not eyeballed: every pair that touches, and
every pair listed one above the other in the picker, is scored by OKLab distance
under normal vision and under simulated protanopia and deuteranopia, against the
same floors the app's data-viz guidance uses (ΔE 15 normal, 8 colour-blind).

The palette is a **system, not seventeen separate choices**: nine hues evenly
spaced round the wheel, each at two steps — one deep, one bright — at matched
chroma, so every colour is the same two recipes applied to one ring. Only the
assignment is searched. Free-optimising seventeen hues scores better on paper
and produces a clown suit; holding one hue family per region instead cannot
separate six leg muscles without colliding with the next family. A region takes
a hue and gives its muscles different steps of it where the separation allows,
and the picker's headings carry the rest of the grouping.

Both canvases constrain it: lightness sits in the overlap of the light-mode and
dark-mode bands, and chroma is checked on the colour that actually comes out —
a hue outside sRGB gets clipped and can land under the floor where it reads as
grey, which is why the deep step avoids the cyans.

Decimation happens last. meshopt's simplifier only collapses edges, so the
surviving vertices are a subset of the originals and their zone ids stay valid
without resampling. Afterwards each triangle is given a single zone and
vertices are split so none straddles two: without that, a boundary triangle has
corners in different zones and the shader blends between their colours, smearing
every muscle edge into a wide gradient instead of a clean line.

## UV convention

glTF puts the texture origin at the **top-left with v pointing down**, unlike
OpenGL. Sampling with the usual `1 - v` flip reads mirrored positions, which on
a scrambled atlas returns unrelated colours — the model comes out as confetti
rather than clean muscles. `check-uv-sampling.py` renders the sampled colours
back onto the body: it should look like the source model, and if it looks like
noise the convention is wrong.

## Notes

Textures aren't shipped with the model. The viewer paints muscles from its own
region palette, so the exported GLB carries only geometry, normals and the zone
attribute — which is why it's a fraction of the source model's size.

Nothing is ever labelled face by face, which is what kept seams off the artwork.
A region is labelled as a whole, and the only cuts made are at a measured
landmark or along the mirror image of a border the model was already painted
with. Long straps like sartorius that run hip to knee are handled by the
landmark constraints instead, which stop a patch forming across the hip in the
first place.

Where the muscles end up, as a share of the body's surface:

| | trunk | legs | arms | head + neck |
| --- | --- | --- | --- | --- |
| measured | 39.1% | 35.1% | 16.2% | 9.5% |
| rule of nines | 36% | 36% | 18% | 9% |

Adductors come out small (1.3%) because the model paints little of the inner
thigh as its own region; trapezius comes out large (11%) because it absorbs the
rhomboids and the whole upper back, which the model does not separate. Both are
the artwork's doing, and forcing either would mean overriding it — which is what
produced the bleed in the first place.

## Strays

Region growing works on the painted texture, and the arms hang beside the
thighs. Where the two surfaces nearly touch, growth crossed the gap. Before
the wrist landmark below existed, this showed up as **127 faces on the upper
thighs labelled "forearm"** — selecting Forearm lit part of the leg. That
specific stray is gone now, not fixed separately: it was genuine hand
geometry that used to get swallowed into "fore" by the bug described below,
carrying its own misplaced-thigh sliver along with it under the wrong name.
With hand correctly identified, the same sliver shows up as ~230 faces of
"hand" landing on the thighs instead, caught by the same rule under its
correct name.

`5-despeckle-zones.py` finds this from geometry alone, without re-running the
segmentation:

| rule | test | what it caught |
| --- | --- | --- |
| detached island | smaller than a fifth of its zone, and more than 0.10 from the zone's main mass | four "hand" scraps, 0.223–0.258 away, 228 faces total |
| speck zone | under 0.5% of the surface, in pieces more than 0.10 apart | — |

The size test is what spares a paired muscle: the real left and right halves
are comparable in size, so neither is ever the small one. Every legitimately
separate island in the model is well under the threshold.

Each patch takes **one** zone, the majority vote of the kept surface around it
counted on the folded body. Voting per face instead paints a mosaic — these
patches straddle quadriceps, glutes and hamstrings — and the internal borders
never quite mirror, which is worse for symmetry than one label per patch.

Only `_ZONE` bytes change, so the file keeps its length and layout and a second
run is a no-op.

**Fixed:** the hands used to be labelled forearm — "fore" and "hand" were
painted as one continuous, unbordered patch, cut only by an unmeasured `0.46`
guess that actually bisected the palm rather than finding the wrist, and
whatever survived that was then folded back into "fore" by the one-in-six
minority rule, since "hand" wasn't on the list of landmark cuts that rule is
meant to protect. `2-name-muscles.py` now measures the wrist properly (see the
landmark table above) and exempts "hand" from the minority fold. Verified by
rendering the corrected zone map and checking the wrist boundary against the
model by eye, then by `check-symmetry.py`: "hand" sits at 3.18% of body
surface, 1.59%/1.59% left/right, with 0.1% mirror mismatch — one of the
best-agreeing zones in the model, not the near-empty zone it was.
