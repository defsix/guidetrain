"""
Edge-preserving smooth of the sampled face colours.

Each triangle covers only a handful of texels, so a single sample carries the
texture's JPEG artefacts and the fine striations painted along each muscle. That
noise measures about the same size as the colour difference between two
neighbouring muscles, which leaves no threshold that separates muscles without
also shattering them.

This averages each face with its neighbours, but weights each neighbour by how
close its colour already is — so shading and noise inside a muscle average away,
while a painted border, being a large jump, is barely averaged across at all.
Repeating it lets a face draw on a wider neighbourhood without ever bleeding
over an edge.

Writes `facecol.npy` in place (keeping the raw sample as `facecol_raw.npy`).
"""
import struct, json, os
import numpy as np

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

if not os.path.exists("facecol_raw.npy"):
    np.save("facecol_raw.npy", np.load("facecol.npy"))
col=np.load("facecol_raw.npy").astype(np.float64)

# face adjacency over welded vertices
key=np.round(pos*1e5).astype(np.int64)
_,weld=np.unique(key,axis=0,return_inverse=True)
wt=weld[tris]
edges=np.sort(np.concatenate([wt[:,[0,1]],wt[:,[1,2]],wt[:,[2,0]]]),axis=1)
fo=np.tile(np.arange(NF),3)
o=np.lexsort((edges[:,1],edges[:,0])); edges,fo=edges[o],fo[o]
same=np.all(edges[1:]==edges[:-1],axis=1)
fa,fb=fo[:-1][same],fo[1:][same]
A=np.concatenate([fa,fb]); B=np.concatenate([fb,fa])
print(f"faces {NF}, adjacency {len(A)}")

def chroma(c):
    return c/np.maximum(c.sum(1,keepdims=True),1e-6)

SIGMA=0.020      # colour gap treated as "still the same muscle"
ITERS=24
SELF=0.5         # how much of its own colour a face keeps each pass

for it in range(ITERS):
    ch=chroma(col)
    d=np.sqrt(((ch[A]-ch[B])**2).sum(1))
    w=np.exp(-(d/SIGMA)**2)                  # neighbours across a border ≈ 0
    num=np.zeros_like(col); den=np.zeros(NF)
    np.add.at(num, A, col[B]*w[:,None])
    np.add.at(den, A, w)
    keep=SELF/max(1e-9,1-SELF)               # own weight, relative
    col=(num+col*(den[:,None]*keep+1e-9))/np.maximum(den+den*keep+1e-9,1e-9)[:,None]

np.save("facecol.npy", col)

raw=np.load("facecol_raw.npy").astype(np.float64)
for nm,c in [("before",raw),("after ",col)]:
    ch=chroma(c)
    sat=(c.max(1)-c.min(1))/np.maximum(c.max(1),1e-6)
    both=(sat[fa]>=0.34)&(sat[fb]>=0.34)
    s=np.sqrt(((ch[fa]-ch[fb])**2).sum(1))[both]
    print(f"{nm} neighbour step: p50={np.percentile(s,50):.4f} "
          f"p75={np.percentile(s,75):.4f} p90={np.percentile(s,90):.4f} "
          f"p99={np.percentile(s,99):.4f}")
