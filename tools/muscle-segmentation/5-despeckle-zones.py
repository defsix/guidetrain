#!/usr/bin/env python3
"""Strip zone labels that landed somewhere the muscle isn't.

Run on the built `.glb`s, after 4-build-glb.mjs:

    python3 5-despeckle-zones.py ../../apps/web/public/models/anatomy_mobile.glb
    python3 5-despeckle-zones.py ../../apps/web/public/models/anatomy_full.glb

Add --dry-run to see what it would change without writing.

Why this exists
---------------
Region growing works on the painted texture, and the arms hang beside the
thighs. Where the two surfaces nearly touch, growth crossed the gap: 127 faces
on the upper thighs came out labelled "forearm", so selecting Forearm lit part
of the leg. The same crossing left an 87-face "hand" patch on the thighs while
the real hands ended up labelled forearm.

Both are the same defect — a label a long way from the muscle it names — and
both are recognisable from geometry alone, without re-running the segmentation.

Two rules, each measured against the shipped model rather than guessed:

  detached island  An island smaller than a fifth of its zone and further than
                   DETACHED from the zone's main mass. In the model the real
                   left/right halves of a paired muscle are comparable in size,
                   so the size test alone spares them; the forearm strays sit
                   0.202 away, while every legitimately separate island is
                   within 0.066.

  speck zone       A zone holding less than SPECK of the surface whose islands
                   are all detached from each other. That is not a muscle, it
                   is leftover noise. "Hand" is 0.15% of the surface in two
                   detached scraps; no other zone is under 1%.

Each flagged patch takes one zone — the majority vote of the kept surface
around it, counted on the body folded about its midline. Only `_ZONE` bytes
change: same length, same layout, so the rest of the file is untouched, and
running it twice is a no-op.

Mirror disagreement goes from 0.76% to 0.73%, i.e. the strays were themselves
a source of asymmetry. `check-symmetry.py` is the check.
"""
import argparse
import collections
import json
import struct
import sys

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

# Model units: the body stands 1.9 tall. A surface gap of 0.10 is far wider
# than any seam between neighbouring muscles.
DETACHED = 0.10
SPECK = 0.005          # fraction of all faces
ISLAND_FRACTION = 0.20  # of its own zone, below which an island may be stray
VOTES = 8             # nearest kept faces consulted per patch

COMP = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_glb(path):
    raw = bytearray(open(path, 'rb').read())
    assert raw[:4] == b'glTF', f'{path} is not a .glb'
    off, chunks = 12, {}
    while off < len(raw):
        clen, ctype = struct.unpack_from('<II', raw, off)
        chunks[ctype] = (off + 8, clen)
        off += 8 + clen + (-clen % 4)
    js_off, js_len = chunks[0x4E4F534A]
    bin_off, _ = chunks[0x004E4942]
    return raw, json.loads(bytes(raw[js_off:js_off + js_len]).decode('utf-8')), bin_off


def read_accessor(gltf, raw, bin_off, i):
    acc = gltf['accessors'][i]
    bv = gltf['bufferViews'][acc['bufferView']]
    fmt = COMP[acc['componentType']]
    n = NUM[acc['type']]
    size = struct.calcsize('<' + fmt)
    start = bin_off + bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride') or size * n
    out = np.empty((acc['count'], n), dtype=np.dtype(fmt))
    for k in range(acc['count']):
        out[k] = struct.unpack_from('<' + fmt * n, raw, start + k * stride)
    return (out if n > 1 else out.ravel()), start, stride, fmt


def islands(idx, face_zone, pos):
    """Connected components of same-zone faces, welded across split vertices."""
    q = np.round(pos, 5)
    _, weld = np.unique(q.view([('', q.dtype)] * 3), return_inverse=True)
    weld = weld.ravel()
    we = weld[idx]
    edges = np.sort(np.vstack([we[:, [0, 1]], we[:, [1, 2]], we[:, [2, 0]]]), axis=1)
    face_of = np.tile(np.arange(len(idx)), 3)
    order = np.lexsort((edges[:, 1], edges[:, 0]))
    e, f = edges[order], face_of[order]
    same = (e[:-1] == e[1:]).all(axis=1)
    a, b = f[:-1][same], f[1:][same]
    keep = face_zone[a] == face_zone[b]
    a, b = a[keep], b[keep]
    g = coo_matrix((np.ones(len(a)), (a, b)), shape=(len(idx), len(idx)))
    return connected_components(g + g.T, directed=False)[1]


def find_strays(face_zone, comp, cen, names, log):
    total = len(face_zone)
    flagged = np.zeros(total, dtype=bool)

    for zid in sorted(set(face_zone.tolist())):
        fs = np.where(face_zone == zid)[0]
        cs, counts = np.unique(comp[fs], return_counts=True)
        centres = {c: cen[fs[comp[fs] == c]].mean(axis=0) for c in cs}

        # speck zone: too small to be a muscle, and in pieces
        if len(fs) < total * SPECK and len(cs) > 1:
            apart = min(
                np.linalg.norm(centres[x] - centres[y])
                for i, x in enumerate(cs) for y in cs[i + 1:]
            )
            if apart > DETACHED:
                flagged[fs] = True
                log.append(f"  speck zone      {names[zid]:<22} {len(fs):>4} faces "
                           f"in {len(cs)} pieces {apart:.3f} apart")
                continue

        # detached island: small, and nowhere near the rest of its zone
        anchors = cs[counts >= counts.max() * ISLAND_FRACTION]
        anchor_pts = cen[np.isin(comp, anchors) & (face_zone == zid)]
        for c, n in zip(cs, counts):
            if c in anchors:
                continue
            pts = cen[comp == c]
            d = float(np.linalg.norm(anchor_pts - pts.mean(axis=0), axis=1).min())
            if d > DETACHED:
                flagged[comp == c] = True
                log.append(f"  detached island {names[zid]:<22} {n:>4} faces "
                           f"{d:.3f} from the muscle")
    return flagged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    raw, gltf, bin_off = read_glb(args.glb)
    prim = gltf['meshes'][0]['primitives'][0]
    pos, *_ = read_accessor(gltf, raw, bin_off, prim['attributes']['POSITION'])
    zone, z_start, z_stride, z_fmt = read_accessor(
        gltf, raw, bin_off, prim['attributes']['_ZONE'])
    idx, *_ = read_accessor(gltf, raw, bin_off, prim['indices'])
    idx = idx.astype(np.int64).reshape(-1, 3)
    zone = zone.astype(int)

    here = __file__.rsplit('/', 1)[0]
    mp = json.load(open(f'{here}/../../apps/web/src/anatomy/muscle-map.json'))
    names = {i: z['name'] for i, z in enumerate(mp['zones'])}

    fz = zone[idx]
    face_zone = np.where(fz[:, 0] == fz[:, 1], fz[:, 0],
                         np.where(fz[:, 0] == fz[:, 2], fz[:, 0], fz[:, 1]))
    cen = pos[idx].mean(axis=1)
    comp = islands(idx, face_zone, pos)

    log = []
    flagged = find_strays(face_zone, comp, cen, names, log)
    print(f"{args.glb}: {len(idx)} faces, {flagged.sum()} flagged")
    for line in log:
        print(line)
    if not flagged.any():
        print("  nothing to do")
        return

    # Each stray patch takes ONE zone: the majority vote of the kept faces
    # around it, counted on the body folded about its midline so a patch and
    # its mirror image reach the same answer.
    #
    # One label per patch rather than per face is deliberate. Voting per face
    # paints a small mosaic — the 64-face patches straddle quadriceps, glutes
    # and hamstrings — and the internal borders never quite mirror, which took
    # mirror disagreement from 0.76% to 0.93%. Deciding once per patch leaves
    # no internal borders to disagree about, and lands at 0.73%: better than
    # before the repair, because the strays were themselves a source of it.
    kept = np.where(~flagged)[0]
    fold = lambda p: np.column_stack([np.abs(p[:, 0]), p[:, 1], p[:, 2]])
    tree = cKDTree(fold(cen[kept]))
    stray = np.where(flagged)[0]

    new = np.empty(len(stray), dtype=int)
    for c in np.unique(comp[stray]):
        sel = np.where(comp[stray] == c)[0]
        _, j = tree.query(fold(cen[stray[sel]]), k=VOTES)
        tally = collections.Counter(face_zone[kept][j].ravel().tolist())
        new[sel] = tally.most_common(1)[0][0]
    print("  reassigned to:", ', '.join(
        f"{names[z]} {n}" for z, n in collections.Counter(new.tolist()).most_common()))

    # Boundaries are split in this mesh, so a stray face's vertices belong to
    # no one else. Refuse to write if that ever stops being true.
    stray_faces = np.where(flagged)[0]
    vs = np.unique(idx[stray_faces])
    shared = np.isin(idx, vs).any(axis=1)
    shared[stray_faces] = False
    if shared.any():
        sys.exit(f"refusing to write: {shared.sum()} kept faces share vertices with strays")

    for face, z in zip(stray_faces, new):
        for v in idx[face]:
            zone[v] = z
    if args.dry_run:
        print("  --dry-run, nothing written")
        return
    for v in range(len(zone)):
        struct.pack_into('<' + z_fmt, raw, z_start + v * z_stride, int(zone[v]))
    open(args.glb, 'wb').write(bytes(raw))
    print(f"  wrote {args.glb}")


if __name__ == '__main__':
    main()
