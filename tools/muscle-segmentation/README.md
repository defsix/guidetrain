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
```

Then, once the result is copied into the app:

```bash
python3 check-symmetry.py      # left/right agreement of the shipped model
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

A region is labelled **as a whole**, from one reading of the rules at its centre
of area. The patch outlines come from the colours painted on the model, so they
already are the muscle borders; the rules only get to pick which muscle a region
is, never to carve one up on a threshold. Labelling faces individually and then
stitching the results put the seam wherever a threshold happened to fall,
cutting straight across the artwork — that was the bleed between groups.

Landmarks found in the mesh keep that honest: the crotch (where the legs merge)
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
comes out spans both halves of the body and is its own mirror, so one decision
per unit is symmetric by construction. The new cuts aren't arbitrary: each is
the reflection of a border the model was painted with, which is where that
border belongs on the other side. Narrow offcuts left where the two sides differ
only slightly are merged into the neighbour they share the most border with;
the units are their own mirror, so that merge stays symmetric too.

| | disagreement | surface cut across a painted patch |
| --- | --- | --- |
| join patches to their mirror | 5.56% | 2.4% |
| …then cut along the mirror | 0.19% | 6.2% |

Cutting the raw patches instead of the joined regions reaches the same symmetry
with four times the cutting, because pairs that already agreed get split too.

On the shipped model the figure is 3.1% rather than 0.19%: decimation collapses
edges without regard for the mirror, leaving a one-triangle fringe along every
border. No muscle's left and right areas now differ by more than 3%.

Landmarks are measured, not assumed. The crotch is found by scanning upward for
where surface on the midline jumps as the legs merge. The elbow is the thinnest
point of the limb between shoulder and wrist, which lands at f=0.67 — the rules
had assumed 0.62, and the gap let a patch span the elbow so the forearm was
swallowed into biceps along with it. The neck runs from where the shoulders
finish tapering up to the chin, found as the slice where the front surface juts
forward out of the throat; assuming a height instead put the chest's upper bound
inside the throat and the whole neck came out labelled as chest, and the skull
here is barely wider than the neck, so width alone reads the face as neck.

The upper arm is the single place a patch is cut rather than followed. It's
painted as one region wrapping right round the limb — the largest patch there is
47% front and 53% back — so biceps and triceps have no border between them to
follow, and are divided at the patch's own midline.

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

Nothing is ever labelled face by face, which is what kept seams off the artwork:
a region is labelled as a whole, and the only cuts made are the mirror images of
borders the model was already painted with. Long straps like sartorius that run
hip to knee are handled by the landmark constraints instead, which stop a patch
forming across the hip in the first place.
