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
2. **Snap** each tint to the model's palette, discovered by clustering the
   clearly-tinted faces. Comparison is in chromaticity (`rgb / sum`), which
   ignores the shading baked into the texture. Snapping to a fixed palette
   rather than comparing neighbours pairwise is what stops regions leaking into
   each other through the gradual shading around tendons.
3. **Grow** connected components over faces sharing a tint. Colours are reused
   across the body, so a tint alone doesn't identify a muscle — a tint plus
   spatial connectivity does, and left/right separate on their own because they
   aren't connected across the surface.
4. **Fill** the remaining unclaimed surface (shaded edges, tendon, bone) by
   expanding the muscle cores into it until every face is owned.
5. **Group** the resulting patches into the app's muscle groups, then **smooth**
   the grouping across the surface and bake the zone index onto each vertex as
   the glTF `_ZONE` attribute.

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

### The one exception: quadriceps and hamstrings

This model paints the front and back of the thigh in near-identical reds — one
tint measures 8% front and 13% back — so colour cannot tell them apart, and a
patch often wraps round the limb covering both. Those patches, and only those,
are cut front-from-back along the limb's own centre line, which is roughly where
the two groups actually divide. Colouring the two groups differently in the
source model would remove the need for it.

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

Patches spanning a large share of the body's height are labelled face by face
rather than as a unit: long straps like sartorius run hip to knee, and the fill
step can bridge two neighbours, so a single label taken from the centroid would
drag a whole group out of place.
