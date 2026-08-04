"""
Map segmented muscle patches onto the app's muscle taxonomy.

A region is labelled as a whole rather than face by face, so the painted
outline stays the border between groups. Which way it faces is read once for
the whole region — that is what per-face noise ruins — while its height is read
per face, so a region spanning a landmark is cut there.

Landmarks are measured from the mesh, never assumed: the crotch where the legs
merge, the ribcage's lower edge, the throat hollow and the chin, the elbow, and
the sideways reach separating a limb from the trunk.

Front and back are told apart by how much of a region's surface faces each way,
not by where its centre sits — a limb is round, so a patch along the back of the
thigh has its centre almost on the axis. The inner thigh faces neither way, so
the adductors are found by facing the midline instead.

Left and right are reconciled by mirroring the model onto itself, so the two
sides always come out with the same muscles.
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

# Iliac crest: the top of the pelvis. Walking down from the waist, the trunk
# flares out to the hips; the crest is where it has gained half that flare.
# It is the upper edge of the glutes behind and of the hip in front, and with
# the crotch it fixes the line where the leg stops being the trunk.
_XMID=(pos[:,0].min()+pos[:,0].max())/2
_AX=np.abs(fpos[:,0]-_XMID)
_hf=np.arange(CROTCH,0.62,0.01)
_hw=np.array([np.percentile(_AX[(FR>=f)&(FR<f+0.01)&(_AX<0.14)],99) for f in _hf])
_wk=int(np.argmin(_hw))                       # narrowest slice above the hips
_half=(_hw[_wk]+_hw[:_wk+1].max())/2
_cand=np.where(_hw[:_wk+1]>=_half)[0]         # highest slice still hip-wide
ILIAC=float(_hf[_cand.max()]) if len(_cand) else CROTCH
HIPX=float(_hw[0])                            # half-width at the hips

# Ribs: the lower edge of the ribcage. Below it the trunk pinches in to the
# waist; above it the chest is at full depth. Taken as the height where the
# trunk has won back half the depth it loses at the waist. Trapezius reaches
# down the middle of the back to about here and erector spinae is what shows
# below, so it is where the central back changes muscle.
#
# Depth is used rather than girth because the arms come inside any sideways
# measurement of the trunk at this height and swamp it.
_rf=np.arange(0.55,0.80,0.01)
_d=[]
for f in _rf:
    m=(FR>=f)&(FR<f+0.01)&(np.abs(fpos[:,0])<0.12)
    _d.append(np.ptp(np.percentile(fpos[m,2],[1,99])))
_d=np.array(_d); _w0=int(np.argmin(_d))
RIBS=_rf[_w0+int(np.argmax(_d[_w0:]>=(_d[_w0]+_d[_w0:].max())/2))]

# Neck: its foot is the throat hollow — the dip in the front surface between
# the collarbones, where the chest stops and the throat begins — and its top is
# the chin, where that surface juts forward again. Both are turning points of
# one profile. Width doesn't work for either: the shoulders slope up into the
# neck so there is no step at the bottom, and the skull here is barely wider
# than the neck, so a width test reads the whole face as neck.
_fs=np.arange(0.74,0.98,0.005)
_z=[]
for f in _fs:
    m=(FR>=f)&(FR<f+0.005)&(np.abs(fpos[:,0])<0.12)
    _z.append(np.percentile(fpos[m,2],99) if m.sum()>20 else np.inf)
_z=np.array(_z); _lo=int(np.argmin(_z))
NECK_LO=_fs[_lo]
NECK_HI=_fs[_lo+1+int(np.diff(_z[_lo:]).argmax())]
print(f"landmarks: crotch f={CROTCH:.3f}  ribs f={RIBS:.2f}  elbow f={ELBOW}  "
      f"arm |x|>{ARM_X}  iliac f={ILIAC:.2f}  neck f={NECK_LO:.3f}..{NECK_HI:.3f}")

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

# Which way a face looks. The adductors are the inner thigh: they face the
# body's midline rather than forward or back, which no front-or-back test can
# see. Measured this way they stand well clear — the one region the model
# paints there looks inward over 86% of its area, and every other region of the
# thigh is at 48% or less.
_N=np.cross(pos[tris[:,1]]-pos[tris[:,0]],pos[tris[:,2]]-pos[tris[:,0]])
_N/=np.maximum(np.linalg.norm(_N,axis=1,keepdims=True),1e-12)
_side=np.sign(fpos[:,0]-(pos[:,0].min()+pos[:,0].max())/2); _side[_side==0]=1
MEDIAL=(_N[:,0]*_side)<-0.5                                 # looking inward

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

def classify(f,x,ff,mf=0.0):
    """f: height, x: sideways, ff: share facing front, mf: share facing inward.

    Front and back are told apart by how much of a region's surface faces
    forward, not by how far its centre sits from the body's axis. A limb is
    round, so a patch lying along the back of the thigh has its centre only
    just behind the axis — three of them measured between 0.004 and 0.009
    behind, well inside a threshold meant to catch the hamstrings at 0.033,
    and so came out as quadriceps despite only a tenth of their surface facing
    forward. The share facing forward separates the same patches cleanly: the
    hamstrings sit at 0%, the quadriceps at 84-100%.
    """
    ax=abs(x)
    # A region counts as facing back only if most of it does. The cut sits at
    # 0.45 rather than 0.5 because the inner thigh faces sideways, not front or
    # back: the adductors measure almost exactly half and half, and an unbiased
    # test turns them into hamstrings on a coin toss. The posterior patches it
    # has to catch are all at 0.35 or below.
    back=ff<0.45
    # The shoulder cap sits closer to the midline than the arm below it, so the
    # limb boundary tightens over the deltoid's height.
    armx = 0.07 if 0.76 < f < 0.90 else ARM_X
    if ax>armx:                                   # limb, clear of the trunk
        if f>0.76: return "delt"
        if f>ELBOW: return "tri" if back else "bic"
        if f>0.46: return "fore"
        return "hand"
    # Where the leg stops being the trunk. In front the hip crease is lowest at
    # the midline, where the legs meet, and rises to the crest of the pelvis at
    # the sides; behind, the glutes simply end at the crest. Treating it as one
    # horizontal plane ruled a straight line across both hips — obliques
    # covering the top of the quadriceps in front, the same seam over the
    # glutes behind.
    hip = ILIAC if back else CROTCH+(ILIAC-CROTCH)*min(1.0,ax/HIPX)
    if f<hip:                                     # pelvis and below: leg
        if f<0.055: return "foot"
        if f<0.30:  return "calf" if back else "shin"
        # The buttock hangs below the crotch line; hamstrings start under it.
        if back: return "glute" if f>0.44 else "ham"
        # The adductors are the inner thigh, told by facing the midline. Asking
        # instead for a narrow strip near the midline caught vastus medialis,
        # which runs just as close but looks forward.
        if mf>0.6: return "add"
        return "quad"
    if back:                                      # trunk, back
        # trapezius runs down the middle of the back as far as the waist;
        # erector spinae is what shows below it. Lats are to the sides.
        if f<RIBS:    return "erector" if ax<0.042 else "lat"
        if f<0.82:    return "traps" if ax<0.055 else "lat"
        if f<NECK_LO: return "traps"
        if f<NECK_HI: return "neck"
        return "head"
    if f<0.58:    return "abs" if ax<0.045 else "obl"
    # rectus abdominis is a narrow central strap; the flanks are oblique
    if f<0.72:    return "abs" if ax<0.040 else "obl"
    if f<NECK_LO: return "pec"
    if f<NECK_HI: return "neck"
    return "head"

FRONT=DZ>0          # which side of the body's own axis a face looks out from


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

# --- match every face to its mirror -------------------------------------
#
# The body is symmetric, so a muscle and its mirror have to be decided together,
# or one thigh comes out "quadriceps" and the other "adductors" purely because
# their centres fell either side of a rule's threshold.
#
# Matching is done face by face rather than by comparing patch centres: each
# face is paired with the face nearest its own mirrored position. Comparing
# centres pairs only 19 patches out of 112 — segmentation is not mirror-perfect,
# and the two halves of one muscle can have quite different centres.
from scipy.spatial import cKDTree
XMID=(pos[:,0].min()+pos[:,0].max())/2
FX=fpos[:,0]-XMID
tree=cKDTree(np.column_stack([FX,fpos[:,1],fpos[:,2]]))
mdist,partner_face=tree.query(np.column_stack([-FX,fpos[:,1],fpos[:,2]]),k=1)
MATCHED=mdist<0.004*H       # a poor match means the surface isn't mirrored here
partner_patch=fm[partner_face]

# --- 1. join each patch to its mirror -----------------------------------
#
# A patch is joined to whichever patch covers most of its mirror image. Needing
# that to be more than half the patch stops two different muscles from being
# chained together: relaxing it to a fifth does drive the disagreement lower,
# but only by merging trapezius, latissimus and erector spinae into one region.
parent={c:c for c in ids}
def find(x):
    while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
    return x
def union(x,y):
    rx,ry=find(x),find(y)
    if rx!=ry: parent[rx]=ry

for c in ids:
    m=fm==c
    if abs(cens[c][0]-XMID)<0.012: continue           # midline mirrors to itself
    cand=np.unique(partner_patch[m])
    w=np.array([area[m][partner_patch[m]==k].sum() for k in cand])
    d=cand[w.argmax()]
    if (d!=c and w.max()/areas[c]>0.5
            and np.sign(cens[d][0]-XMID)!=np.sign(cens[c][0]-XMID)):
        union(c,d)

gid=np.array([find(c) for c in fm])
paired=sum(1 for c in ids if find(c)!=c)

# --- 2. cut what is left along its own mirror ---------------------------
#
# Joining is not enough on its own: where one side is painted as a single patch
# and the other as three, no pairing of whole patches can agree, and that is
# exactly where the abdomen and flank stayed lopsided. So each joined region is
# cut along the mirror image of the other side's borders — a region is split by
# which region its mirror lands in. Every unit that comes out of this spans both
# halves of the body and is its own mirror, so a single decision per unit is
# symmetric by construction.
#
# The new cuts are not arbitrary: each one is the reflection of a border the
# model itself was painted with, which is where that border belongs on the other
# side. Cutting the raw patches this way instead of the joined regions gives the
# same symmetry but four times the cutting, because pairs that already agreed
# get split too.
a=np.minimum(gid,gid[partner_face])
b=np.maximum(gid,gid[partner_face])
key=a.astype(np.int64)*(gid.max()+1)+b
key[~MATCHED]=-1-gid[~MATCHED]
_,unit=np.unique(key,return_inverse=True)

# --- 3. fold the offcuts back in ----------------------------------------
#
# Where the two sides disagree only slightly the cut leaves a narrow offcut.
# Each is merged into the neighbour it shares the most border with. The units
# are their own mirror, so their shared borders are too and the merge stays
# symmetric.
wkey=np.round(pos*1e5).astype(np.int64)
_,weld=np.unique(wkey,axis=0,return_inverse=True)
wt=weld[tris]
E=np.sort(np.concatenate([wt[:,[0,1]],wt[:,[1,2]],wt[:,[2,0]]]),axis=1)
fo=np.tile(np.arange(len(tris)),3)
o=np.lexsort((E[:,1],E[:,0])); E,fo=E[o],fo[o]
dup=np.all(E[1:]==E[:-1],axis=1)
FA=np.concatenate([fo[:-1][dup],fo[1:][dup]])
FB=np.concatenate([fo[1:][dup],fo[:-1][dup]])

TOT=area.sum(); MINFRAC=0.0015
NU=int(unit.max())+1
par=np.arange(NU)
def ufind(x):
    while par[x]!=x: par[x]=par[par[x]]; x=par[x]
    return x
cross=unit[FA]!=unit[FB]
pk=unit[FA][cross].astype(np.int64)*NU+unit[FB][cross]
upk,pc=np.unique(pk,return_counts=True)
EA,EB=(upk//NU).astype(int),(upk%NU).astype(int)
uarea=np.zeros(NU); np.add.at(uarea,unit,area)
offcuts=0
for _ in range(8):
    root=np.array([ufind(i) for i in range(NU)])
    ra=np.zeros(NU); np.add.at(ra,root,uarea)
    small=[c for c in range(NU) if root[c]==c and ra[c]/TOT<MINFRAC]
    if not small: break
    RA,RB=root[EA],root[EB]
    moved=False
    for c in sorted(small,key=lambda c:ra[c]):
        if ufind(c)!=c: continue
        m=(RA==c)&(RB!=c)
        if not m.any(): continue
        nb,inv=np.unique(RB[m],return_inverse=True)
        w=np.zeros(len(nb)); np.add.at(w,inv,pc[m])
        par[ufind(c)]=ufind(int(nb[w.argmax()])); moved=True; offcuts+=1
    if not moved: break
unit=np.array([ufind(u) for u in unit])
units=np.unique(unit)

# --- 4. one reading per unit, but cut where it crosses a landmark --------
#
# Sideways position and which way a region faces are read once for the whole
# unit — those are what per-face noise ruins, and reading them per face is what
# used to scatter seams across the artwork. Height is taken per face, so a unit
# that spans a landmark is cut at it.
#
# It has to be, because several painted regions cover two muscle groups with no
# border drawn between them. One region runs from the lumbar spine to the
# shoulder blades — 9% of the whole body, erector spinae and trapezius
# together. Another runs from the collarbone over the top of the skull. Given
# one reading each they come out as a single muscle covering both, which is the
# same complaint as biceps and triceps sharing a patch.
#
# The cuts land only on measured landmarks — the waist, the throat hollow, the
# chin, the crotch — never on an arbitrary height, and a piece holding less
# than a sixth of its unit is given back to the majority so the cut can't leave
# slivers.
decision={}
for u in units:
    m=unit==u; w=area[m]; idx=np.where(m)[0]
    # x is folded per face, not per unit: a unit spans both sides, so averaging
    # its raw x would cancel to nothing and the unit would read as if it sat on
    # the midline.
    ux=(np.abs(fpos[m,0]-XMID)*w).sum()/w.sum()
    uff=area[m&FRONT].sum()/w.sum()
    umf=area[m&MEDIAL].sum()/w.sum()
    f=((fpos[m,1]*w).sum()/w.sum()-Y0)/H
    # The upper arm is painted as one region wrapping right round the limb — the
    # largest patch there is 47% front and 53% back — so biceps and triceps have
    # no border between them to follow. That one place is cut front-from-back.
    # Everywhere else, quadriceps against hamstrings included, the painted
    # outline is the border.
    if ux>ARM_X and ELBOW<f<0.78:
        decision[u]=ARMSPLIT; continue
    lab=np.array([classify(fr,ux,uff,umf) for fr in FR[m]],dtype=object)
    keys,inv=np.unique(lab,return_inverse=True)
    share=np.zeros(len(keys)); np.add.at(share,inv,w)
    major=keys[share.argmax()]
    lab[np.isin(lab,keys[share/w.sum()<1/6])]=major
    decision[u]=lab if len(np.unique(lab))>1 else major

face_group=np.empty(len(tris),dtype=object)
cuts=0
for u in units:
    m=unit==u
    if isinstance(decision[u],np.ndarray):
        face_group[np.where(m)[0]]=decision[u]; cuts+=1
    elif decision[u]==ARMSPLIT:
        dzf=fpos[m][:,2]-ZC_ARM[m]
        face_group[np.where(m)[0]]=np.where(dzf>np.median(dzf),"bic","tri")
    else:
        face_group[m]=decision[u]
print(f"patches: {len(ids)} ({paired} joined to a mirror) -> {len(units)} "
      f"self-mirroring units, {offcuts} offcuts folded back in, "
      f"{cuts} cut at a landmark, "
      f"{sum(1 for v in decision.values() if isinstance(v,str) and v==ARMSPLIT)} arm units split")

# --- 5. smooth the borders ----------------------------------------------
#
# Region growing leaves ragged edges: a border is where two colours met on a
# noisy texture, so it arrives as sawtooth, with spikes of one muscle several
# triangles deep into its neighbour. At a glance that reads as the two colours
# bleeding into each other rather than meeting at a line.
#
# Each face takes whichever muscle covers the most area among itself and its
# neighbours, repeated a few times. A spike has neighbours on three sides that
# disagree with it and gets rounded off; a border that is genuinely straight has
# as much of itself on each side and stays put. Weighting a face's own area
# against its neighbours' sets how hard the smoothing pulls — too hard and thin
# muscles like the adductors erode away, so it is kept gentle and checked
# against the areas afterwards.
#
# This cannot break the symmetry: it depends only on the mesh and on labels that
# are already mirror-images, so both sides round off the same way.
gk=sorted(set(face_group)); gi={g:i for i,g in enumerate(gk)}
lab=np.array([gi[g] for g in face_group],np.int64)
NG=len(gk); NFACE=len(tris); SELF=1.0
for _ in range(4):
    sc=np.bincount(FA*NG+lab[FB],weights=area[FB],minlength=NFACE*NG)
    sc=sc.reshape(NFACE,NG)
    sc[np.arange(NFACE),lab]+=area*SELF
    lab=sc.argmax(1)
moved=(np.array([gi[g] for g in face_group])!=lab)
print(f"border smoothing moved {area[moved].sum()/area.sum()*100:.2f}% of the surface")
face_group=np.array([gk[i] for i in lab],dtype=object)

# One zone per muscle, covering both sides.
#
# Left and right biceps are the same muscle group as far as training goes, so
# they are one selectable zone and highlight together. Splitting them meant
# tapping an arm lit only that arm, and the readout carried a "LEFT"/"RIGHT"
# that nothing acted on.
INERT={"hand","foot","head"}
keys=sorted(set(face_group))
zid={g:i for i,g in enumerate(keys)}
fid=np.array([zid[g] for g in face_group],np.int32)
np.save("face_zone.npy",fid)
zones=[{"id":g,"key":g,"name":NAME[g],"region":REGION[g],"index":i,
        "selectable":g not in INERT}
       for g,i in sorted(zid.items(),key=lambda kv:kv[1])]
json.dump(zones,open("zones.json","w"),indent=1)
print(f"\n{len(zones)} zones ({sum(z['selectable'] for z in zones)} selectable)")
