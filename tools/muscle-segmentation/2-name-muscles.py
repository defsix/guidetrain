"""
Map segmented components onto the app's muscle taxonomy.

Assignment is per component (each is a real muscle patch), except where one
component covers a whole limb segment — the upper arm and lower leg each come
out as a single patch, so those are split front/back about the component's own
depth centre, which is what separates biceps from triceps and shin from calf.
"""
import struct, json
import numpy as np
from PIL import Image

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
fm=np.load("face_muscle.npy")
fpos=pos[tris].mean(1)
area=np.linalg.norm(np.cross(pos[tris[:,1]]-pos[tris[:,0]],
                             pos[tris[:,2]]-pos[tris[:,0]]),axis=1)*.5
Y0,Y1=fpos[:,1].min(),fpos[:,1].max()

REGION={"traps":"Shoulders","delt":"Shoulders","pec":"Chest","abs":"Core",
        "obl":"Core","lat":"Back","erector":"Back","glute":"Legs","quad":"Legs",
        "ham":"Legs","add":"Legs","calf":"Legs","shin":"Legs","bic":"Arms",
        "tri":"Arms","fore":"Arms","hand":"Arms","neck":"Neck","head":"Head",
        "foot":"Legs"}
NAME={"traps":"Trapezius","delt":"Deltoid","pec":"Pectoralis Major",
      "abs":"Rectus Abdominis","obl":"External Oblique","lat":"Latissimus Dorsi",
      "erector":"Erector Spinae","glute":"Gluteus Maximus","quad":"Quadriceps",
      "ham":"Hamstrings","add":"Adductors","calf":"Gastrocnemius / Calf",
      "shin":"Tibialis Anterior","bic":"Biceps Brachii","tri":"Triceps Brachii",
      "fore":"Forearm","hand":"Hand","neck":"Neck","head":"Head","foot":"Foot"}

ARM_X = 0.09           # beyond this the patch is on a limb, not the trunk

def classify(cen):
    x,y,z=cen; f=(y-Y0)/(Y1-Y0)
    if abs(x)>ARM_X:                       # arm
        if f>0.78: return "delt"
        if f>0.62: return "upperarm"       # split later into bic / tri
        if f>0.46: return "fore"
        return "hand"
    if f<0.055: return "foot"
    if f<0.30:  return "lowerleg"          # split later into calf / shin
    if f<0.45:  return "ham"  if z<-0.012 else "quad"
    if f<0.50:  return "glute" if z<-0.02 else ("add" if abs(x)<0.05 else "quad")
    if f<0.56:  return "glute" if z<-0.02 else "abs"
    if f<0.70:
        if z<-0.02: return "erector" if abs(x)<0.045 else "lat"
        return "abs" if abs(x)<0.05 else "obl"
    if f<0.80:  return "lat" if z<-0.03 else ("traps" if z<-0.005 else "pec")
    if f<0.88:  return "traps" if z<-0.02 else "pec"
    if f<0.90:  return "neck"
    return "head"

# A patch reaching across more than this much of the body's height spans more
# than one muscle group (long straps like sartorius run hip to knee, and the
# watershed can bridge two neighbours). Labelling those from one centroid drags
# a whole group out of place — e.g. abs claiming the inner thigh — so they get
# labelled face by face instead. Compact patches, the vast majority, keep the
# single exact label their segmentation gives them.
MAX_SPAN=0.18
SPAN=fpos[:,1].max()-fpos[:,1].min()

face_group=np.empty(len(tris),dtype=object)
for c in np.unique(fm):
    m=fm==c
    p=fpos[m]
    cen=p.mean(0)
    if (p[:,1].max()-p[:,1].min())/SPAN > MAX_SPAN:
        face_group[np.where(m)[0]]=[classify(q) for q in p]
        continue
    g=classify(cen)
    if g=="upperarm":
        cz=p[:,2].mean()
        face_group[np.where(m)[0]]=np.where(p[:,2]>cz,"bic","tri")
    elif g=="lowerleg":
        cz=p[:,2].mean()
        face_group[np.where(m)[0]]=np.where(p[:,2]<cz,"calf","shin")
    else:
        face_group[m]=g

# per-face labelling can still emit the two split-only names
for i,g in enumerate(face_group):
    if g=="upperarm": face_group[i]="bic" if fpos[i,2]>-0.02 else "tri"
    elif g=="lowerleg": face_group[i]="calf" if fpos[i,2]<-0.015 else "shin"

groups=sorted(set(face_group))
print(f"{'muscle':<22}{'region':<11}{'area%':>7}")
tot=area.sum()
for g in sorted(groups,key=lambda g:-area[face_group==g].sum()):
    print(f"{NAME[g]:<22}{REGION[g]:<11}{area[face_group==g].sum()/tot*100:>7.2f}")

# Midline structures are single zones; everything else is a left/right pair,
# decided purely by x sign so no stray "centre" copy appears.
MIDLINE={"abs","erector","neck","head","traps"}
side=np.where(fpos[:,0]>0,"L","R")
for g in MIDLINE:
    side[face_group==g]="C"

# Hands, feet and head aren't trainable groups: they stay neutral and inert.
INERT={"hand","foot","head"}

zid={}
for i,(g,s) in enumerate(sorted({(g,s) for g,s in zip(face_group,side)})):
    zid[(g,s)]=i
fid=np.array([zid[(g,s)] for g,s in zip(face_group,side)],np.int32)
np.save("face_zone.npy",fid)
zones=[{"id":(g if s=="C" else f"{g}_{s}"),"key":g,"name":NAME[g],
        "region":REGION[g],"side":s,"index":i,
        "selectable": g not in INERT}
       for (g,s),i in sorted(zid.items(),key=lambda kv:kv[1])]
json.dump(zones,open("zones.json","w"),indent=1)
sel=sum(1 for z in zones if z["selectable"])
print(f"\n{len(zones)} zones ({sel} selectable, {len(zones)-sel} inert)")

RC={"Shoulders":"#ff8a5c","Chest":"#e8574a","Back":"#c73f6e","Arms":"#f2b13c",
    "Core":"#d94436","Legs":"#b5503a","Neck":"#e06a4d","Head":"#4a5568"}
def hx(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
fcol=np.array([hx(RC[REGION[g]]) for g in face_group])

S=1000
P=np.concatenate([pos[tris[:,0]],pos[tris[:,1]],pos[tris[:,2]],pos[tris].mean(1)])
C=np.concatenate([fcol,fcol,fcol,fcol])
def render(front=True):
    x,y,z=P[:,0],P[:,1],P[:,2]
    u=x if front else -x; d=z if front else -z
    lo=np.array([u.min(),y.min()]); hi=np.array([u.max(),y.max()]); span=(hi-lo).max()
    ix=np.clip(((u-lo[0])/span*(S-1)*.88+S*.06).astype(int),0,S-1)
    iy=np.clip(((hi[1]-y)/span*(S-1)*.88+S*.06).astype(int),0,S-1)
    out=np.zeros((S,S,3),np.uint8); zb=np.full((S,S),-1e9)
    for i in np.argsort(d):
        if d[i]>zb[iy[i],ix[i]]: zb[iy[i],ix[i]]=d[i]; out[iy[i],ix[i]]=C[i]
    return out
Image.fromarray(render(True)).save("region2-front.png")
Image.fromarray(render(False)).save("region2-back.png")
print("wrote region2-front.png / region2-back.png")
