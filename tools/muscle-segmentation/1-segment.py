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

d2=((chrom[:,None,:]-pal[None])**2).sum(-1)
tint=d2.argmin(1); dist=np.sqrt(d2.min(1))
tint[(sat<0.30)|(dist>0.085)]=-1

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

keep=(tint[fa]==tint[fb])&(tint[fa]>=0)
g=coo_matrix((np.ones(keep.sum()),(fa[keep],fb[keep])),shape=(NF,NF))
ncomp,lab=connected_components(g,directed=False)

MIN_FACES=400
cn=np.bincount(lab,minlength=ncomp)
valid=(cn>=MIN_FACES)
valid[np.unique(lab[tint<0])]=False          # untinted blobs aren't muscles
core=np.where(valid[lab], lab, -1)
print(f"cores: {valid.sum()} components, {(core>=0).mean()*100:.0f}% of faces")

# --- watershed: expand cores into unclaimed faces ------------------------
cur=core.copy()
for it in range(2000):
    # only grow FROM an already-labelled face INTO an unlabelled one, else an
    # unlabelled neighbour can win the write and stall the front permanently
    m=(cur[A]>=0)&(cur[B]<0)
    if not m.any(): break
    nxt=cur.copy()
    nxt[B[m]]=cur[A[m]]
    if np.array_equal(nxt,cur): break
    cur=nxt
print(f"after watershed: {(cur>=0).mean()*100:.1f}% of faces claimed ({it+1} iters)")

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
        rgb=[int(v) for v in np.median(fcol[m&(tint>=0)],axis=0)] if (m&(tint>=0)).any() else [0,0,0],
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
