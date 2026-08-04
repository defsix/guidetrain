"""Which muscles touch on the model, and how long a border they share."""
import struct, json
import numpy as np
GLB="/home/user/guidetrain/apps/web/public/models/anatomy_mobile.glb"
d=open(GLB,"rb").read(); jl=struct.unpack("<I",d[12:16])[0]
J=json.loads(d[20:20+jl]); bo=20+jl+8
def acc(i):
    a=J["accessors"][i]; bv=J["bufferViews"][a["bufferView"]]
    c={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    dt={5126:"<f4",5125:"<u4",5123:"<u2",5121:"<u1"}[a["componentType"]]
    s=bo+bv.get("byteOffset",0)+a.get("byteOffset",0)
    r=np.frombuffer(d,dtype=dt,count=a["count"]*c,offset=s)
    return r.reshape(a["count"],c) if c>1 else r
pr=J["meshes"][0]["primitives"][0]
pos=acc(pr["attributes"]["POSITION"]).astype(np.float64)
zone=acc(pr["attributes"]["_ZONE"]).astype(int)
tris=acc(pr["indices"]).astype(np.int64).reshape(-1,3)
nm={z["index"]:z["id"] for z in json.load(open("/home/user/guidetrain/apps/web/src/anatomy/muscle-map.json"))["zones"]}
fz=zone[tris[:,0]]
key=np.round(pos*1e5).astype(np.int64)
_,weld=np.unique(key,axis=0,return_inverse=True)
wt=weld[tris]
E=np.sort(np.concatenate([wt[:,[0,1]],wt[:,[1,2]],wt[:,[2,0]]]),axis=1)
V=np.concatenate([wt[:,[0,1]],wt[:,[1,2]],wt[:,[2,0]]])
fo=np.tile(np.arange(len(tris)),3)
o=np.lexsort((E[:,1],E[:,0])); Es,fos,Vs=E[o],fo[o],V[o]
dup=np.all(Es[1:]==Es[:-1],axis=1)
a,b=fos[:-1][dup],fos[1:][dup]
elen=np.linalg.norm(pos[Es[:-1][dup][:,0]]-pos[Es[:-1][dup][:,1]],axis=1)
diff=fz[a]!=fz[b]
pairs={}
for za,zb,L in zip(fz[a][diff],fz[b][diff],elen[diff]):
    k=(min(za,zb),max(za,zb)); pairs[k]=pairs.get(k,0.0)+L
out=sorted(((L,nm[i],nm[j]) for (i,j),L in pairs.items()),reverse=True)
print("muscles that touch, by shared border length:")
for L,x,y in out:
    if L<0.01: continue
    print(f"  {x:<9}{y:<9}{L:.3f}")
json.dump([[x,y] for L,x,y in out if L>=0.01],open("adjacency.json","w"))
print(f"\n{sum(1 for L,_,_ in out if L>=0.01)} touching pairs")
