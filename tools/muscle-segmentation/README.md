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
5. **Group** the resulting patches into the app's muscle groups, and bake the
   zone index onto each vertex as the glTF `_ZONE` attribute.

Decimation happens last. meshopt's simplifier only collapses edges, so the
surviving vertices are a subset of the originals and their zone ids stay valid
without resampling.

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
