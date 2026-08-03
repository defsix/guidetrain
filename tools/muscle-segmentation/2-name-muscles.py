"""
Map segmented muscle patches onto the app's muscle taxonomy.

Each patch is labelled as a whole, from one reading at its centre of area, so
the painted outline stays the border between groups.

Landmarks found in the mesh keep it anatomical: the crotch, where the legs
merge, and the sideways reach separating a limb from the trunk. Depth is
measured against the body's own centre line at each height, with the arms
given their own since they hang behind the trunk's in this pose.

Left and right are reconciled against each other, and the upper arm — painted
as one region wrapping round the limb — is the single place a patch is cut
rather than followed.
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
ELBOW=0.67          # thinnest point of the limb between shoulder and wrist
print(f"landmarks: crotch f={CROTCH:.3f}  elbow f={ELBOW}  arm |x|>{ARM_X}")

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
        if f>ELBOW: return "bic" if dz>0 else "tri"
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


# Each patch gets one decision, taken at its centre of area.
#
# A patch outline comes from the colours painted on the model, so it already IS
# a muscle border; the rules only choose which muscle a patch is, never carve
# one up. Labelling faces individually put the seam wherever a threshold
# happened to fall, cutting across the artwork — that was the bleed. And the
# reading is taken once at the centre rather than voted over the faces, because
# per-face labels are noisy inside a single muscle (a thigh muscle picks up
# "adductor" where it nears the midline) and voting on that noise scatters
# neighbouring muscles into different groups.
ids=np.unique(fm)
cens={}; areas={}
for c in ids:
    m=fm==c; w=area[m]
    cens[c]=(fpos[m]*w[:,None]).sum(0)/w.sum(); areas[c]=w.sum()

ARMSPLIT="__armsplit__"

# The body is symmetric, so a muscle and its mirror should be decided together.
# Segmentation isn't quite mirror-perfect, and where one patch's centre lands
# near a rule's threshold its twin can fall the other side of it — which showed
# up as one oblique covering 2.57% of the body against 1.76% for the other.
#
# Patches are paired with whichever patch most nearly mirrors them, and the pair
# is decided ONCE from the average of the two centres (mirroring x so the sides
# can be averaged). Averaging is steadier than trusting either side alone: a
# centre sitting right on a threshold is pulled to whichever side the pair
# agrees on, instead of the two disagreeing.
pair={}
for c in ids:
    cen=cens[c]
    if abs(cen[0])<0.012: continue                   # midline, mirrors to itself
    mirror=np.array([-cen[0],cen[1],cen[2]])
    best,bd=None,np.inf
    for d in ids:
        if d==c: continue
        dist=np.linalg.norm(cens[d]-mirror)
        if dist<bd: bd,best=dist,d
    if best is None or bd>0.020 or np.sign(cens[best][0])==np.sign(cen[0]): continue
    pair[c]=best

def centre_for(c):
    """Centre used to decide patch c: averaged with its mirror where there is one."""
    cen=cens[c]
    d=pair.get(c)
    if d is None: return cen
    twin=cens[d]*np.array([-1,1,1])                  # reflect the twin onto this side
    wc,wd=areas[c],areas[d]
    return (cen*wc+twin*wd)/(wc+wd)

decision={}
for c in ids:
    cen=centre_for(c); m=fm==c
    f=(cen[1]-Y0)/H
    # The upper arm is painted as one region wrapping right round the limb — the
    # largest patch there is 47% front and 53% back — so biceps and triceps have
    # no border between them to follow. That one place is cut front-from-back.
    # Everywhere else, quadriceps against hamstrings included, the painted
    # outline is the border.
    if abs(cen[0])>ARM_X and ELBOW<f<0.78:
        decision[c]=ARMSPLIT
        continue
    dz=cen[2]-(ZC_ARM[m] if abs(cen[0])>ARM_X else ZC_TRUNK[m]).mean()
    decision[c]=classify(f,cen[0],dz)

# Mirrored patches take the same decision. Settled here, before any split is
# applied — reconciling afterwards flattens a split patch back to one label.
for c,d in pair.items():
    if decision[c]!=decision[d]:
        winner=c if areas[c]>=areas[d] else d
        decision[c]=decision[d]=decision[winner]
paired=len(pair)//2

face_group=per_face.copy()
for c in ids:
    m=fm==c
    if decision[c]==ARMSPLIT:
        dzf=fpos[m][:,2]-ZC_ARM[m]
        face_group[np.where(m)[0]]=np.where(dzf>np.median(dzf),"bic","tri")
    else:
        face_group[m]=decision[c]
print(f"patches: {len(ids)} labelled from their centre, "
      f"{paired//2} mirror pairs reconciled, "
      f"{sum(1 for v in decision.values() if v==ARMSPLIT)} upper-arm patches split")

# No landmark correction or label smoothing pass here on purpose. Both worked
# face by face, so both cut across the painted outlines — exactly the bleed
# they were meant to tidy up. Landmarks still do their job inside classify(),
# deciding which muscle a patch is; the patch keeps its own edges.

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
