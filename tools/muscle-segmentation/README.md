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

Each patch is labelled **as a whole**, from one reading of the rules at its
centre of area. The patch outlines come from the colours painted on the model,
so they already are the muscle borders; the rules only get to pick which muscle
a patch is, never to carve one up. Labelling faces individually and then
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
gap to put a threshold in. Region growing at 0.025 then separates every muscle
group the model distinguishes — including quadriceps from hamstrings, which
before denoising had to be cut geometrically.

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

Every patch is labelled as a whole — nothing is ever cut face by face, which is
what kept seams off the artwork. Long straps like sartorius that run hip to knee
are handled by the landmark constraints instead, which stop a patch forming
across the hip in the first place.
