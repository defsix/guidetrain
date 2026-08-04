"""
Symmetry check on the shipped model.

Reads the .glb the viewer actually loads and the muscle map that goes with it —
not any intermediate — decodes the baked _ZONE attribute, and for every triangle
finds the triangle nearest its own mirrored position. If the labelling is
symmetric the two carry the same zone.

Reports the disagreeing surface overall and per muscle, plus each muscle's
left/right area split.

    python3 check-symmetry.py [path/to/model.glb]
"""
import struct, json, sys, os
import numpy as np
from scipy.spatial import cKDTree

ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..")
GLB=sys.argv[1] if len(sys.argv)>1 else os.path.join(
    ROOT,"apps","web","public","models","anatomy_mobile.glb")
MAP=os.path.join(ROOT,"apps","web","src","anatomy","muscle-map.json")

data=open(GLB,"rb").read()
jl=struct.unpack("<I",data[12:16])[0]
J=json.loads(data[20:20+jl]); bo=20+jl+8
def acc(i):
    a=J["accessors"][i]; bv=J["bufferViews"][a["bufferView"]]
    c={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    dt={5126:"<f4",5125:"<u4",5123:"<u2",5121:"<u1"}[a["componentType"]]
    s=bo+bv.get("byteOffset",0)+a.get("byteOffset",0)
    r=np.frombuffer(data,dtype=dt,count=a["count"]*c,offset=s)
    return r.reshape(a["count"],c) if c>1 else r

prim=J["meshes"][0]["primitives"][0]
attrs=prim["attributes"]
assert "_ZONE" in attrs, "shipped model has no _ZONE attribute"
pos=acc(attrs["POSITION"]).astype(np.float64)
zone=acc(attrs["_ZONE"]).astype(int)
tris=acc(prim["indices"]).astype(np.int64).reshape(-1,3)

zones=json.load(open(MAP))["zones"]
name={z["index"]:z["id"] for z in zones}
print(f"shipped: {len(pos)} verts, {len(tris)} tris, {len(zones)} zones")

# vertices of a triangle all share a zone (they're split at borders), so a
# triangle's zone is just its first corner's
fz=zone[tris[:,0]]
fpos=pos[tris].mean(1)
area=np.linalg.norm(np.cross(pos[tris[:,1]]-pos[tris[:,0]],
                             pos[tris[:,2]]-pos[tris[:,0]]),axis=1)*.5
tot=area.sum()

# centre the model on x so mirroring is about the body's own midline
xmid=(pos[:,0].min()+pos[:,0].max())/2
fx=fpos[:,0]-xmid
mir=np.column_stack([-fx,fpos[:,1],fpos[:,2]])
tree=cKDTree(np.column_stack([fx,fpos[:,1],fpos[:,2]]))
dist,partner=tree.query(mir,k=1)

# only judge where a real counterpart exists; a poor match means the surface
# genuinely isn't mirrored there, not that the labelling disagrees
scale=pos[:,1].max()-pos[:,1].min()
ok=dist<0.004*scale
mismatch=(fz!=fz[partner])&ok

print(f"\nmatched surface: {area[ok].sum()/tot*100:.1f}%  "
      f"(unmatched {area[~ok].sum()/tot*100:.1f}% — no mirror counterpart)")
print(f"MIRROR DISAGREEMENT: {area[mismatch].sum()/area[ok].sum()*100:.2f}% of matched surface")

print(f"\n{'muscle':<10}{'area%':>7}{'left':>8}{'right':>8}{'L/R skew':>10}{'mismatch%':>11}")
rows=[]
for zi in sorted(set(fz.tolist())):
    m=fz==zi
    L=m&(fx>0); R=m&(fx<0)
    a_=area[m].sum(); l=area[L].sum(); r=area[R].sum()
    skew=abs(l-r)/max(l+r,1e-9)*100
    mm=area[m&mismatch].sum()/max(area[m&ok].sum(),1e-9)*100
    rows.append((a_,name.get(zi,f"?{zi}"),l,r,skew,mm))
for a_,n,l,r,skew,mm in sorted(rows,reverse=True):
    print(f"{n:<10}{a_/tot*100:>7.2f}{l/tot*100:>8.2f}{r/tot*100:>8.2f}{skew:>9.1f}%{mm:>10.1f}%")
