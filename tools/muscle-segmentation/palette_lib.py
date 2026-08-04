"""
Colour maths for the palette: OKLab/OKLCH to sRGB, and the colour-vision
simulations the separation is scored under.

The transforms are Machado, Oliveira & Fernandes (2009) at severity 1.0 — the
same ones the data-viz validator uses, so a distance measured here means the
same thing as one measured there.
"""
import json, math, random
import numpy as np

# ---- OKLab / OKLCH <-> sRGB ------------------------------------------------
M1=np.array([[0.4122214708,0.5363325363,0.0514459929],
             [0.2119034982,0.6806995451,0.1073969566],
             [0.0883024619,0.2817188376,0.6299787005]])
M2=np.array([[0.2104542553,0.7936177850,-0.0040720468],
             [1.9779984951,-2.4285922050,0.4505937099],
             [0.0259040371,0.7827717662,-0.8086757660]])
M1i=np.linalg.inv(M1); M2i=np.linalg.inv(M2)

def lin2srgb(c):
    c=np.clip(c,0,1)
    return np.where(c<=0.0031308,12.92*c,1.055*np.power(c,1/2.4)-0.055)
def srgb2lin(c):
    return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)

def oklch_to_linear(L,C,h):
    a=C*math.cos(math.radians(h)); b=C*math.sin(math.radians(h))
    lms=M2i@np.array([L,a,b])
    return M1i@(lms**3)

def in_gamut(lin,eps=1e-4):
    return bool((lin>=-eps).all() and (lin<=1+eps).all())

def oklch_to_hex(L,C,h):
    """Reduce chroma until the colour fits in sRGB, then quantise."""
    lo,hi=0.0,C
    if not in_gamut(oklch_to_linear(L,C,h)):
        for _ in range(30):
            mid=(lo+hi)/2
            if in_gamut(oklch_to_linear(L,mid,h)): lo=mid
            else: hi=mid
        C=lo
    rgb=lin2srgb(oklch_to_linear(L,C,h))
    return "#%02x%02x%02x"%tuple(int(round(v*255)) for v in np.clip(rgb,0,1))

def hex_to_lin(hx):
    return srgb2lin(np.array([int(hx[i:i+2],16)/255 for i in (1,3,5)]))

def lin_to_oklab(lin):
    return M2@np.cbrt(M1@np.clip(lin,0,1))

# Machado, Oliveira & Fernandes (2009), severity 1.0 — the same transforms the
# skill's validator uses, so the numbers here and there mean the same thing.
MACHADO={
 "protan":np.array([[0.152286,1.052583,-0.204868],
                    [0.114503,0.786281,0.099216],
                    [-0.003882,-0.048116,1.051998]]),
 "deutan":np.array([[0.367322,0.860646,-0.227968],
                    [0.280085,0.672501,0.047413],
                    [-0.011820,0.042940,0.968881]])}

def labs_of(hexes):
    lin=np.array([hex_to_lin(h) for h in hexes])
    out={"normal":np.array([lin_to_oklab(l) for l in lin])}
    for k,M in MACHADO.items():
        out[k]=np.array([lin_to_oklab(M@l) for l in lin])
    return out

# ---- the muscles ----------------------------------------------------------
REGION={"traps":"Shoulders","delt":"Shoulders","pec":"Chest","abs":"Core",
        "obl":"Core","lat":"Back","erector":"Back","glute":"Legs","quad":"Legs",
        "ham":"Legs","add":"Legs","calf":"Legs","shin":"Legs","bic":"Arms",
        "tri":"Arms","fore":"Arms","neck":"Neck"}
# Head, hands and feet aren't trainable, so they stay neutral. The grey is
# kept light: at mid lightness it collided with the muscles it touches.
INERT={"head":"#b9bdc4","hand":"#b9bdc4","foot":"#b9bdc4"}
MUS=sorted(REGION)
REGIONS=["Neck","Shoulders","Chest","Back","Arms","Core","Legs"]

TOUCH=[tuple(p) for p in json.load(open("adjacency.json"))]
TOUCH=[(a,b) for a,b in TOUCH if a in REGION or a in INERT]

# The order the picker lists them in. Two muscles sitting one above the other
# there have to be separable even though they may be nowhere near each other on
# the body, so these pairs are held to the same floor as the ones that touch.
ORDER=["neck","traps","delt","pec","lat","erector","bic","tri","fore",
       "abs","obl","glute","quad","add","ham","calf","shin"]
TOUCH=TOUCH+[(ORDER[i],ORDER[i+1]) for i in range(len(ORDER)-1)]

# Both the light and the dark canvas have to hold these, so lightness sits in
# the overlap of the two bands the validator allows.
# Lightness is squeezed from both sides: the canvas is near-white in day mode
# and near-black at night, and a swatch needs to carry against both. Chroma is
# checked on the colour that actually comes out, not the one asked for — a hue
# outside the sRGB gamut gets its chroma cut to fit, and can land under the
# floor where it reads as grey.
LMIN,LMAX=0.50,0.63
CMIN,CMAX=0.13,0.22
CFLOOR=0.105
# A region with six muscles in it needs a wider slice of the wheel than one
# with a single muscle, or its members cannot be told apart.
# Hue is left free. Muscles in a region are NOT forced to share a hue family:
# with seventeen of them, six in the legs alone, a family wide enough to hold
# its members apart is wide enough to collide with the next family. The picker
# carries the grouping in its layout and labels instead, which is what keeps
# identity off colour alone.
SPREAD={r:180.0 for r in REGIONS}
GAP=0.0

def hdist(a,b):
    d=abs(a-b)%360
    return min(d,360-d)

def score(state, base, report=False):
    """Two floors, because a muscle is read in two places.

    On the model only muscles that touch can be confused, and those have to
    clear the full target. In the picker all seventeen swatches sit together in
    one list, so every pair needs to be separable there too — a lower bar, but
    a real one: optimising for the model alone produced five near-identical
    violets scattered over the body, fine in place and useless in the legend.
    """
    hexes=[oklch_to_hex(*state[m]) for m in MUS]+[INERT[k] for k in ("head","hand","foot")]
    names=MUS+["head","hand","foot"]
    idx={n:i for i,n in enumerate(names)}
    L=labs_of(hexes)
    D=lambda k,i,j: float(np.linalg.norm(L[k][i]-L[k][j])*100)
    worst=1e9; wp=None; rows=[]
    for a_,b_ in TOUCH:
        if a_ not in idx or b_ not in idx: continue
        i,j=idx[a_],idx[b_]
        dn=D("normal",i,j); dc=min(D("protan",i,j),D("deutan",i,j))
        v=min(dn/15.0,dc/8.0); rows.append((v,a_,b_,dn,dc))
        if v<worst: worst,wp=v,(a_,b_,dn,dc)
    legend=1e9; lp=None
    for i in range(len(MUS)):
        for j in range(i+1,len(MUS)):
            dn=D("normal",i,j)
            if dn<legend: legend,lp=dn,(MUS[i],MUS[j])
    # realised chroma, after any gamut clipping
    lowC=0.0
    for h in hexes[:len(MUS)]:
        lab=lin_to_oklab(hex_to_lin(h)); c=math.hypot(lab[1],lab[2])
        if c<CFLOOR: lowC+=(CFLOOR-c)
    if report: return worst,wp,hexes,names,sorted(rows),legend,lp
    fam=0.0
    for r in REGIONS:
        ms=[m for m in MUS if REGION[m]==r]
        if len(ms)<2: continue
        hs=[math.radians(state[m][2]) for m in ms]
        mean=math.atan2(sum(math.sin(h) for h in hs)/len(hs),
                        sum(math.cos(h) for h in hs)/len(hs))
        fam+=sum(abs((math.degrees(h-mean)+180)%360-180) for h in hs)/len(hs)
    # the touching floor comes first; the legend and the families spend what is left
    return (3.0*min(worst,1.06) + 0.9*min(legend/10.0,1.0) + 0.0008*(360-fam)
            - 40.0*lowC)

def run(seed):
    rng=random.Random(seed)
    base={r:rng.uniform(0,360) for r in REGIONS}
    state={m:(rng.uniform(LMIN,LMAX),rng.uniform(CMIN,CMAX),base[REGION[m]]) for m in MUS}
    def clampfam():
        for m in MUS:
            Lc,Cc,hc=state[m]; s=SPREAD[REGION[m]]
            d=(hc-base[REGION[m]]+180)%360-180
            if abs(d)>s: state[m]=(Lc,Cc,base[REGION[m]]+math.copysign(s,d))
    cur=score(state,base); best=(dict(state),dict(base)); bestv=cur
    N=30000
    for it in range(N):
        T=max(0.02,1.0-it/N)
        if rng.random()<0.15:
            r=rng.choice(REGIONS); ob=base[r]
            base[r]=(base[r]+rng.gauss(0,25))%360
            saved={m:state[m] for m in MUS if REGION[m]==r}
            for m in saved:
                Lc,Cc,hc=state[m]; state[m]=(Lc,Cc,hc+(base[r]-ob))
            clampfam()
            new=score(state,base)
            if new>cur or rng.random()<math.exp((new-cur)/(0.05*T)):
                cur=new
                if new>bestv: bestv,best=new,(dict(state),dict(base))
            else:
                base[r]=ob; state.update(saved)
            continue
        m=rng.choice(MUS); Lc,Cc,hc=state[m]; s=SPREAD[REGION[m]]
        k=rng.random()
        if k<0.34:   Lc=min(LMAX,max(LMIN,Lc+rng.gauss(0,0.05)))
        elif k<0.67: Cc=min(CMAX,max(CMIN,Cc+rng.gauss(0,0.03)))
        else:
            hc=hc+rng.gauss(0,12)
            d=(hc-base[REGION[m]]+180)%360-180
            if abs(d)>s: hc=base[REGION[m]]+math.copysign(s,d)
        old=state[m]; state[m]=(Lc,Cc,hc)
        new=score(state,base)
        if new>cur or rng.random()<math.exp((new-cur)/(0.05*T)):
            cur=new
            if new>bestv: bestv,best=new,(dict(state),dict(base))
        else:
            state[m]=old
    return best,bestv
