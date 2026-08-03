"""
Final segmentation pass.

1. Snap faces to the canonical tint palette and grow connected components
   (as in segment3) — these are confident muscle cores.
2. Discard cores that are too small to be a real muscle, and
3. Watershed-expand the surviving cores across the unclaimed faces (shaded
   edges, tendon, bone) so every face ends up owned by exactly one muscle,
   with boundaries falling naturally between neighbouring cores.

Output: `face_muscle.npy` — one component id per triangle, no gaps.
"""
import struct, json
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

data=open("model.glb","rb").read(); jl=struct.unpack("<I",data[12:16])[0]
J=json.loads(data[20:20+jl]); bo=20+jl+8
def acc(i):
    a=J["accessors"][i]; bv=J["bufferViews"][a["bufferView"]]
    c={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    dt={5126:"<f4",5125:"<u4",5123:"<u2",5121:"<u1"}[a["componentType"]]
    s=bo+bv.get("byteOffset",0)+a.get("byteOffset",0)
    r=np.frombuffer(data,dtype=dt,count=a["count"]*c,offset=s)
    return r.reshape(a["count"],c) if c>1 else r

prim=J["meshes"][0]["primitives"][0]
pos=acc(prim["attributes"]["POSITION"]).astype(np.float64)
tris=acc(prim["indices"]).astype(np.int64).reshape(-1,3)
NF=len(tris)
fcol=np.load("facecol.npy"); pal=np.load("palette.npy")

fpos=pos[tris].mean(1)
area=np.linalg.norm(np.cross(pos[tris[:,1]]-pos[tris[:,0]],
                             pos[tris[:,2]]-pos[tris[:,0]]),axis=1)*.5
chrom=fcol/np.maximum(fcol.sum(1,keepdims=True),1e-6)
sat=(fcol.max(1)-fcol.min(1))/np.maximum(fcol.max(1),1e-6)

# Faces are grown together by comparing each against its neighbour, rather than
# snapping both to a shared palette. Muscles are painted with shading across
# them, so two faces at opposite ends of one muscle can be further apart in
# colour than two faces either side of a border — a palette wide enough to hold
# a muscle together also merges muscles whose colours are close. Neighbour to
# neighbour, shading changes gradually and a painted border is a single jump, so
# growth crosses the first and stops at the second.
tinted = sat >= 0.34          # bone, tendon and white can't carry a muscle

key=np.round(pos*1e5).astype(np.int64)
_,weld=np.unique(key,axis=0,return_inverse=True)
wt=weld[tris]
edges=np.sort(np.concatenate([wt[:,[0,1]],wt[:,[1,2]],wt[:,[2,0]]]),axis=1)
fo=np.tile(np.arange(NF),3)
o=np.lexsort((edges[:,1],edges[:,0])); edges,fo=edges[o],fo[o]
same=np.all(edges[1:]==edges[:-1],axis=1)
fa,fb=fo[:-1][same],fo[1:][same]
# symmetric adjacency
A=np.concatenate([fa,fb]); B=np.concatenate([fb,fa])

# Landmarks constrain the cores as well as the fill. A painted region can run
# continuously from the abdomen onto the thigh, and joining it into one patch
# would carry an abdominal label down the leg no matter how the patch is named
# later.
_fp=pos[tris].mean(1)
_y0,_y1=_fp[:,1].min(),_fp[:,1].max()
_frac=(_fp[:,1]-_y0)/(_y1-_y0)
CROTCH=0.50
ARM_X=0.09
region_id=np.where(_frac<CROTCH,0,1)+np.where(np.abs(_fp[:,0])>ARM_X,2,0)

STEP=0.016          # noise p75 is 0.0068; the closest border (bic-tri) is 0.039
step=np.sqrt(((chrom[fa]-chrom[fb])**2).sum(1))
keep=(step<STEP)&tinted[fa]&tinted[fb]&(region_id[fa]==region_id[fb])
g=coo_matrix((np.ones(keep.sum()),(fa[keep],fb[keep])),shape=(NF,NF))
ncomp,lab=connected_components(g,directed=False)

MIN_FACES=400
cn=np.bincount(lab,minlength=ncomp)
valid=(cn>=MIN_FACES)
valid[np.unique(lab[~tinted])]=False          # untinted blobs arent muscles
core=np.where(valid[lab], lab, -1)
print(f"cores: {valid.sum()} components, {(core>=0).mean()*100:.0f}% of faces")

# --- watershed: expand cores into unclaimed faces ------------------------
#
# The fill is barred from crossing anatomical landmarks. Between the thighs and
# the abdomen sits the pelvis, which is bone and tendon and carries no muscle
# tint of its own — so a thigh core would otherwise flood straight up through it
# and end up as one patch spanning the hip, dragging leg muscles onto the
# stomach. The same applies where an arm passes the torso.
crosses=region_id[A]!=region_id[B]

cur=core.copy()
for it in range(2000):
    # only grow FROM an already-labelled face INTO an unlabelled one, else an
    # unlabelled neighbour can win the write and stall the front permanently
    m=(cur[A]>=0)&(cur[B]<0)&(~crosses)
    if not m.any(): break
    nxt=cur.copy()
    nxt[B[m]]=cur[A[m]]
    if np.array_equal(nxt,cur): break
    cur=nxt
print(f"after constrained fill: {(cur>=0).mean()*100:.1f}% claimed ({it+1} iters)")

# Anything left sits in a pocket with no core to grow from — the pelvis, mostly.
# Letting it take whatever reaches them would mean crossing a landmark after
# all, re-joining the thigh to the abdomen. Each leftover pocket becomes a patch
# in its own right instead, and gets named from its own position like any other.
left=cur<0
if left.any():
    g2=coo_matrix((np.ones((~crosses&left[A]&left[B]).sum()),
                   (A[~crosses&left[A]&left[B]], B[~crosses&left[A]&left[B]])),
                  shape=(NF,NF))
    n2,l2=connected_components(g2,directed=False)
    nxt_id=cur.max()+1
    for c in np.unique(l2[left]):
        m=left&(l2==c)
        if m.sum()<80: continue          # specks aren't muscles
        cur[m]=nxt_id; nxt_id+=1
    # tiny remnants still unclaimed: let them join a neighbour, within region
    for _ in range(200):
        m=(cur[A]>=0)&(cur[B]<0)&(~crosses)
        if not m.any(): break
        nxt=cur.copy(); nxt[B[m]]=cur[A[m]]
        if np.array_equal(nxt,cur): break
        cur=nxt
    cur[cur<0]=cur.max()+1               # anything left over, one last patch
print(f"after pocket pass:     {(cur>=0).mean()*100:.1f}% claimed, "
      f"{len(np.unique(cur))} patches")

face_muscle=cur
np.save("face_muscle.npy",face_muscle)

ids=np.unique(face_muscle[face_muscle>=0])
ymin,ymax=fpos[:,1].min(),fpos[:,1].max()
rows=[]
for c in ids:
    m=face_muscle==c
    p,cen=fpos[m],fpos[m].mean(0)
    rows.append(dict(comp=int(c),faces=int(m.sum()),
        pct=float(area[m].sum()/area.sum()*100),
        rgb=[int(v) for v in np.median(fcol[m&tinted],axis=0)] if (m&tinted).any() else [0,0,0],
        side=("L" if cen[0]>0.012 else "R" if cen[0]<-0.012 else "C"),
        cen=[float(v) for v in cen], frac=float((cen[1]-ymin)/(ymax-ymin)),
        xr=[float(p[:,0].min()),float(p[:,0].max())],
        yr=[float(p[:,1].min()),float(p[:,1].max())],
        zr=[float(p[:,2].min()),float(p[:,2].max())]))
rows.sort(key=lambda r:-r["pct"])
json.dump(rows,open("segments4.json","w"),indent=1)

print(f"\n{'#':>6} {'area%':>6} {'sd':>2} {'rgb':>15} {'ycen':>6} {'yspan':>13} "
      f"{'xspan':>13} {'zcen':>6}")
for r in rows[:45]:
    print(f"{r['comp']:>6} {r['pct']:>6.2f} {r['side']:>2} "
          f"({r['rgb'][0]:>3},{r['rgb'][1]:>3},{r['rgb'][2]:>3}) {r['cen'][1]:>6.3f} "
          f"[{r['yr'][0]:>5.2f},{r['yr'][1]:>5.2f}] "
          f"[{r['xr'][0]:>5.2f},{r['xr'][1]:>5.2f}] {r['cen'][2]:>6.3f}")
print(f"\ntotal {len(rows)} muscle components")
