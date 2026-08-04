"""
Build the muscle palette as a system rather than seventeen separate choices.

Nine hues evenly spaced round the wheel, each at two steps — a deep one and a
bright one — at matched chroma. That is what makes it look designed: every
colour is the same two recipes applied to one ring of hues.

A region takes a hue and hands its muscles different steps of it, so the
picker's groups read as families. Only the assignment is searched: which hue
each region gets, and which step each muscle takes. Free-optimising seventeen
hues instead maximised contrast and produced a clown suit — magenta abdominals
against teal quadriceps — which is separable and not a colour scheme.

Scored on the pairs a person can confuse: muscles that touch on the model, and
muscles listed one above the other in the picker.
"""
import json, math, random
import numpy as np
from palette_lib import (labs_of, oklch_to_hex, lin_to_oklab, hex_to_lin,
                            TOUCH, INERT, REGION)

ORDER=["neck","traps","delt","pec","lat","erector","bic","tri","fore",
       "abs","obl","glute","quad","add","ham","calf","shin"]
REGIONS=["Neck","Shoulders","Chest","Back","Arms","Core","Legs"]
MEMBERS={r:[m for m in ORDER if REGION[m]==r] for r in REGIONS}

NHUE=9
# Two steps, both inside the band that holds up on the light and the dark
# canvas. Chroma is a touch higher on the deep step so the pair reads as one
# family lit two ways rather than as two different colours.
STEPS=[(0.487,0.170),(0.668,0.125)]

PAIRS=set()
for a,b in TOUCH:
    if (a in ORDER or a in INERT) and (b in ORDER or b in INERT):
        PAIRS.add(tuple(sorted((a,b))))
for i in range(len(ORDER)-1):
    PAIRS.add(tuple(sorted((ORDER[i],ORDER[i+1]))))
PAIRS=sorted(PAIRS)
NAMES=ORDER+["head","hand","foot"]

def build(h0, hue_of, step_of):
    pal={}
    for m in ORDER:
        L,C=STEPS[step_of[m]]
        pal[m]=oklch_to_hex(L,C,(h0+hue_of[m]*360.0/NHUE)%360)
    return pal

def rate(pal, report=False):
    hexes=[pal[n] for n in ORDER]+[INERT[k] for k in ("head","hand","foot")]
    idx={n:i for i,n in enumerate(NAMES)}
    L=labs_of(hexes)
    D=lambda k,i,j: float(np.linalg.norm(L[k][i]-L[k][j])*100)
    rows=[]
    for a,b in PAIRS:
        if a not in idx or b not in idx: continue
        i,j=idx[a],idx[b]
        dn=D("normal",i,j); dc=min(D("protan",i,j),D("deutan",i,j))
        rows.append((min(dn/15,dc/8),a,b,dn,dc))
    rows.sort()
    return (rows if report else rows[0][0])

def chroma_ok(pal):
    """Chroma as it actually comes out. A hue the deep step cannot hold in sRGB
    gets clipped, and lands under the floor where it reads as grey — so those
    hues have to take the bright step instead."""
    short=0.0
    for h in pal.values():
        lab=lin_to_oklab(hex_to_lin(h)); c=math.hypot(lab[1],lab[2])
        if c<0.108: short+=(0.108-c)
    return short

def family(slot):
    """How much the picker's groups hold together: a region scores when its
    muscles are steps of one hue rather than unrelated colours."""
    tot=0.0
    for r in REGIONS:
        ms=MEMBERS[r]
        if len(ms)<2: continue
        hs=[slot[m][0] for m in ms]
        tot+=(len(ms)-len(set(hs)))/(len(ms)-1)
    return tot/sum(1 for r in REGIONS if len(MEMBERS[r])>1)

def search(seed):
    """Each muscle takes a distinct (hue, step) slot, so no two can collide."""
    rng=random.Random(seed)
    slots=[(h,s) for h in range(NHUE) for s in range(len(STEPS))]
    def make(h0,slot):
        return {m:oklch_to_hex(STEPS[slot[m][1]][0],STEPS[slot[m][1]][1],
                               (h0+slot[m][0]*360.0/NHUE)%360) for m in ORDER}
    order=slots[:]; rng.shuffle(order)
    slot={m:order[i] for i,m in enumerate(ORDER)}
    free=order[len(ORDER):]
    h0=rng.uniform(0,40)
    obj=lambda: (lambda p: rate(p)+0.30*family(slot)-25.0*chroma_ok(p))(make(h0,slot))
    cur=obj(); best=(cur,h0,dict(slot))
    for it in range(6000):
        T=max(0.02,1-it/6000)
        oh0,oslot,ofree=h0,dict(slot),list(free)
        k=rng.random()
        if k<0.2:
            h0=(h0+rng.gauss(0,7))%40
        elif k<0.75:
            a_,b_=rng.sample(ORDER,2); slot[a_],slot[b_]=slot[b_],slot[a_]
        else:
            m=rng.choice(ORDER); i=rng.randrange(len(free))
            slot[m],free[i]=free[i],slot[m]
        v=obj()
        if v>cur or rng.random()<math.exp((v-cur)/(0.04*T)):
            cur=v
            if v>best[0]: best=(v,h0,dict(slot))
        else:
            h0,slot,free=oh0,oslot,ofree
    v,h0,slot=best
    return v,h0,slot,make(h0,slot)

if __name__=="__main__":
    v,h0,slot,pal=max((search(s) for s in range(14)),key=lambda b:b[0])
    rows=rate(pal,report=True)
    print(f"nine hues from {h0:.1f}°, two steps; worst confusable pair "
          f"{rows[0][0]*100:.0f}% of target; region families {family(slot)*100:.0f}%\n")
    for r in REGIONS:
        print(f"{r:<10}"+"  ".join(f"{m}:{pal[m]}" for m in MEMBERS[r]))
    print("\ntightest pairs:")
    for s,a,b,dn,dc in rows[:6]:
        print(f"  {a:<9}{b:<9}normal ΔE {dn:5.1f} (15)   CVD ΔE {dc:5.1f} (8)")
    json.dump(pal,open("palette_final.json","w"),indent=1)
    print("\n"+",".join(pal[m] for m in ORDER))
