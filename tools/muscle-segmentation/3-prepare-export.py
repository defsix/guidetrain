"""
Turn the per-face zone assignment into per-vertex data ready for decimation.

Vertices on a zone border touch faces of several zones, so each vertex takes
the zone covering the most area around it. Positions are also recentred and
scaled to the same 1.9-unit height the viewer already expects.
"""
import struct, json
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
pos=acc(prim["attributes"]["POSITION"]).astype(np.float32)
nrm=acc(prim["attributes"]["NORMAL"]).astype(np.float32)
tris=acc(prim["indices"]).astype(np.uint32).reshape(-1,3)
fz=np.load("face_zone.npy")
zones=json.load(open("zones.json"))
NZ=len(zones)
NV=len(pos)

area=np.linalg.norm(np.cross(pos[tris[:,1]]-pos[tris[:,0]],
                             pos[tris[:,2]]-pos[tris[:,0]]),axis=1)*.5

# area-weighted vote per vertex
score=np.zeros((NV,NZ),np.float32)
for k in range(3):
    np.add.at(score,(tris[:,k],fz),area)
vz=score.argmax(1).astype(np.uint8)
print("per-vertex zones assigned; unassigned:",int((score.max(1)==0).sum()))

# Weld duplicate positions so the decimator can actually collapse across the
# UV seams the original export left behind.
key=np.round(pos.astype(np.float64)*1e5).astype(np.int64)
uniq,weld=np.unique(key,axis=0,return_inverse=True)
NW=len(uniq)
wpos=np.zeros((NW,3),np.float64); wnrm=np.zeros((NW,3),np.float64); cnt=np.zeros(NW)
np.add.at(wpos,weld,pos); np.add.at(wnrm,weld,nrm); np.add.at(cnt,weld,1)
wpos/=cnt[:,None]; wnrm/=np.maximum(cnt[:,None],1)
wnrm/=np.maximum(np.linalg.norm(wnrm,axis=1,keepdims=True),1e-9)
wscore=np.zeros((NW,NZ),np.float32); np.add.at(wscore,weld,score)
wz=wscore.argmax(1).astype(np.uint8)
wtris=weld[tris].astype(np.uint32)
wtris=wtris[(wtris[:,0]!=wtris[:,1])&(wtris[:,1]!=wtris[:,2])&(wtris[:,0]!=wtris[:,2])]
print(f"welded {NV} -> {NW} verts, {len(tris)} -> {len(wtris)} tris")

# Normalise to the viewer's scale: centred on x/z, feet at y=0, 1.9 tall.
mn,mx=wpos.min(0),wpos.max(0)
scale=1.9/(mx[1]-mn[1])
out=wpos.copy()
out[:,0]-=(mn[0]+mx[0])/2
out[:,2]-=(mn[2]+mx[2])/2
out[:,1]-=mn[1]
out*=scale
print("bounds after normalise:",out.min(0).round(3),out.max(0).round(3))

out.astype(np.float32).tofile("exp_pos.bin")
wnrm.astype(np.float32).tofile("exp_nrm.bin")
wz.tofile("exp_zone.bin")
wtris.astype(np.uint32).tofile("exp_idx.bin")
json.dump({"verts":int(NW),"tris":int(len(wtris)),"zones":NZ},
          open("exp_meta.json","w"))
print("wrote exp_*.bin")
