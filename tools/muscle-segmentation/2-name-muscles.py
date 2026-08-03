"""
Map segmented muscle patches onto the app's muscle taxonomy.

Two things keep the grouping anatomically honest:

* Landmarks rather than raw height bands. The crotch (where the legs merge)
  and the armpit are found from the mesh itself, so nothing below the crotch
  can be labelled torso — which is what let the abdominals creep down the
  thighs when only height fractions were used.

* Depth measured against the body's own centre line at that height, not the
  world origin, so front/back stays right where the model leans.

A patch is labelled as a unit when its faces overwhelmingly agree, which keeps
muscles whole and absorbs stray faces. Where they don't agree the patch really
does span two groups — long straps like sartorius run hip to knee — and it's
labelled face by face instead.
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
H=Y1-Y0
FR=(fpos[:,1]-Y0)/H

# --- landmarks ----------------------------------------------------------
# Crotch: scanning upward, the two legs merge into one trunk, so the amount of
# surface sitting on the midline jumps.
trunk=np.abs(fpos[:,0])<0.11
best=None
for f in np.arange(0.40,0.58,0.01):
    a_=((FR>=f)&(FR<f+0.01)&trunk&(np.abs(fpos[:,0])<0.015)).sum()
    b_=((FR>=f-0.03)&(FR<f)&trunk&(np.abs(fpos[:,0])<0.015)).sum()+1
    if best is None or a_/b_>best[1]: best=(f,a_/b_)
CROTCH=best[0]
ARM_X=0.09          # beyond this sideways, a patch is on a limb not the trunk
print(f"landmarks: crotch f={CROTCH:.3f}  arm |x|>{ARM_X}")

# Body centre line in depth, per height slice, so "front" means in front of
# the spine rather than in front of the world origin.
#
# This takes the midpoint of the slice's depth range, not the median: the front
# of the body (abs, pecs) is tessellated far more finely than the smooth back,
# so a median sits well forward of the real centre and much of the back then
# reads as "front".
#
# The arms get their own centre line: in this pose they hang a little behind
# the trunk's, so measuring them against the trunk would read the whole arm as
# "back" and leave the biceps with nothing.
SL=64
sl=np.clip(((FR*SL).astype(int)),0,SL-1)
ARM_X=0.09
is_arm=np.abs(fpos[:,0])>ARM_X

def centre_line(mask):
    zc=np.zeros(SL); last=0.0
    for b in range(SL):
        m=(sl==b)&mask
        if m.sum()>20:
            lo,hi=np.percentile(fpos[m,2],[2,98]); last=(lo+hi)/2
        zc[b]=last
    return zc

ZC_TRUNK=centre_line(~is_arm)[sl]
ZC_ARM=centre_line(is_arm)[sl]
DZ=np.where(is_arm, fpos[:,2]-ZC_ARM, fpos[:,2]-ZC_TRUNK)   # + front, - back

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

def classify(f,x,dz):
    ax=abs(x)
    # The shoulder cap sits closer to the midline than the arm below it, so the
    # limb boundary tightens over the deltoid's height.
    armx = 0.07 if 0.76 < f < 0.90 else ARM_X
    if ax>armx:                                   # limb, clear of the trunk
        if f>0.76: return "delt"
        if f>0.62: return "bic" if dz>0 else "tri"
        if f>0.46: return "fore"
        return "hand"
    if f<CROTCH:                                  # below the crotch: all leg
        if f<0.055: return "foot"
        if f<0.30:  return "calf" if dz<0.004 else "shin"
        # The buttock hangs below the crotch line; hamstrings start under it.
        if dz<-0.010: return "glute" if f>0.44 else "ham"
        # adductors are a narrow strip on the inner thigh only
        if ax<0.032 and 0.36<f<0.48: return "add"
        return "quad"
    if f<0.58:  return "glute" if dz<-0.012 else ("abs" if ax<0.045 else "obl")
    if f<0.72:
        # rectus abdominis is a narrow central strap; the flanks are oblique
        if dz<-0.012: return "erector" if ax<0.042 else "lat"
        return "abs" if ax<0.040 else "obl"
    if f<0.82:
        # trapezius runs down the middle of the upper back, lats to the sides
        if dz<-0.010: return "traps" if ax<0.055 else "lat"
        return "pec"
    if f<0.88:  return "traps" if dz<-0.012 else "pec"
    if f<0.90:  return "neck"
    return "head"

per_face=np.array([classify(FR[i],fpos[i,0],DZ[i]) for i in range(len(tris))],dtype=object)

# Let each patch vote. Strong agreement means it's one muscle and the whole
# patch takes that label; weak agreement means it genuinely spans groups.
AGREE=0.80
face_group=per_face.copy()
whole=split=0
for c in np.unique(fm):
    m=fm==c
    labs,counts=np.unique(per_face[m],return_counts=True)
    w=np.array([area[m][per_face[m]==l].sum() for l in labs])
    if w.max()/w.sum() >= AGREE:
        face_group[m]=labs[w.argmax()]; whole+=1
    else:
        split+=1
print(f"patches: {whole} labelled whole, {split} labelled per-face")

# The patch vote can outvote a landmark: a patch mostly over the pelvis but
# reaching onto the thigh would take a torso label wholesale and drag the
# abdominals down the leg. Landmarks win, so any face on the wrong side of one
# falls back to its own label.
TORSO={"abs","obl","lat","erector","pec","traps","delt"}
UPPER_LEG={"quad","ham","add"}
bad_torso=np.array([g in TORSO for g in face_group])&(FR<CROTCH)
bad_leg=np.array([g in UPPER_LEG for g in face_group])&(FR>CROTCH+0.06)
face_group[bad_torso]=per_face[bad_torso]
face_group[bad_leg]=per_face[bad_leg]
print(f"landmark corrections: {bad_torso.sum()} torso-below-crotch, "
      f"{bad_leg.sum()} leg-above-hip")

# Smooth the labels across the surface. Face-by-face rules put a hard cut
# through whatever they touch, which leaves boundaries speckled where the
# rule's threshold and the mesh disagree. Repeatedly giving each face the
# label most of its neighbourhood carries settles those into clean, contiguous
# regions with boundaries that follow the surface.
from scipy.sparse import coo_matrix
key=np.round(pos*1e5).astype(np.int64)
_,weld=np.unique(key,axis=0,return_inverse=True)
wt=weld[tris]
edges=np.sort(np.concatenate([wt[:,[0,1]],wt[:,[1,2]],wt[:,[2,0]]]),axis=1)
fo=np.tile(np.arange(len(tris)),3)
o=np.lexsort((edges[:,1],edges[:,0])); edges,fo=edges[o],fo[o]
same=np.all(edges[1:]==edges[:-1],axis=1)
fa,fb=fo[:-1][same],fo[1:][same]
A=np.concatenate([fa,fb]); B=np.concatenate([fb,fa])

names=sorted(set(face_group))
nidx={n:i for i,n in enumerate(names)}
lab=np.array([nidx[g] for g in face_group])
for _ in range(12):
    votes=np.zeros((len(tris),len(names)))
    np.add.at(votes,(A,lab[B]),area[B])
    votes[np.arange(len(tris)),lab]+=area*1.4   # keep own label unless clearly outvoted
    nxt=votes.argmax(1)
    if (nxt==lab).all(): break
    lab=nxt
face_group=np.array([names[i] for i in lab],dtype=object)

# landmarks again — smoothing can nudge a region back over one
bad_torso=np.array([g in TORSO for g in face_group])&(FR<CROTCH)
face_group[bad_torso]=per_face[bad_torso]

tot=area.sum()
print(f"\n{'muscle':<22}{'region':<11}{'area%':>7}")
for g in sorted(set(face_group), key=lambda g:-area[face_group==g].sum()):
    print(f"{NAME[g]:<22}{REGION[g]:<11}{area[face_group==g].sum()/tot*100:>7.2f}")

MIDLINE={"abs","erector","neck","head","traps"}
INERT={"hand","foot","head"}
side=np.where(fpos[:,0]>0,"L","R")
for g in MIDLINE: side[face_group==g]="C"

zid={}
for i,(g,s) in enumerate(sorted({(g,s) for g,s in zip(face_group,side)})):
    zid[(g,s)]=i
fid=np.array([zid[(g,s)] for g,s in zip(face_group,side)],np.int32)
np.save("face_zone.npy",fid)
zones=[{"id":(g if s=="C" else f"{g}_{s}"),"key":g,"name":NAME[g],
        "region":REGION[g],"side":s,"index":i,"selectable":g not in INERT}
       for (g,s),i in sorted(zid.items(),key=lambda kv:kv[1])]
json.dump(zones,open("zones.json","w"),indent=1)
print(f"\n{len(zones)} zones ({sum(z['selectable'] for z in zones)} selectable)")
