"""Same validation, but sampling each TRIANGLE at its UV centroid instead of
at vertex UVs. The atlas is made of very small islands, so vertex UVs land on
island borders where bleed/padding contaminates the texel."""
import struct, json
import numpy as np
from PIL import Image

data = open("model.glb","rb").read()
jlen = struct.unpack("<I", data[12:16])[0]
J = json.loads(data[20:20+jlen])
bin_off = 20 + jlen + 8

def accessor(i):
    a = J["accessors"][i]; bv = J["bufferViews"][a["bufferView"]]
    comps = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    dt = {5126:"<f4",5125:"<u4",5123:"<u2",5121:"<u1"}[a["componentType"]]
    start = bin_off + bv.get("byteOffset",0) + a.get("byteOffset",0)
    arr = np.frombuffer(data, dtype=dt, count=a["count"]*comps, offset=start)
    return arr.reshape(a["count"], comps) if comps>1 else arr

prim = J["meshes"][0]["primitives"][0]
pos = accessor(prim["attributes"]["POSITION"]).astype(np.float64)
uv  = accessor(prim["attributes"]["TEXCOORD_0"]).astype(np.float64)
tris = accessor(prim["indices"]).astype(np.int64).reshape(-1,3)

im = np.asarray(Image.open("image2.jpg").convert("RGB")).astype(np.float64)
H, W, _ = im.shape

# UV centroid of each triangle, pulled slightly toward the centre.
def sample_at(bary):
    u = (uv[tris[:,0]]*bary[0] + uv[tris[:,1]]*bary[1] + uv[tris[:,2]]*bary[2])
    px = np.clip((u[:,0]*W).astype(int), 0, W-1)
    py = np.clip((u[:,1]*H).astype(int), 0, H-1)
    return im[py, px]

# Median of several interior barycentric points is robust to a stray texel.
samples = np.stack([
    sample_at((1/3, 1/3, 1/3)),
    sample_at((0.6, 0.2, 0.2)),
    sample_at((0.2, 0.6, 0.2)),
    sample_at((0.2, 0.2, 0.6)),
])
fcol = np.median(samples, axis=0)
np.save("facecol.npy", fcol)

fpos = pos[tris].mean(1)
S = 900
def render(front=True):
    x, y, z = fpos[:,0], fpos[:,1], fpos[:,2]
    u = x if front else -x
    d = z if front else -z
    lo = np.array([u.min(), y.min()]); hi = np.array([u.max(), y.max()])
    span = (hi-lo).max()
    ix = np.clip(((u-lo[0])/span*(S-1)*0.9 + S*0.05).astype(int),0,S-1)
    iy = np.clip(((hi[1]-y)/span*(S-1)*0.9 + S*0.05).astype(int),0,S-1)
    out = np.zeros((S,S,3), np.uint8); zb = np.full((S,S), -1e9)
    for i in np.argsort(d):
        if d[i] > zb[iy[i], ix[i]]:
            zb[iy[i], ix[i]] = d[i]; out[iy[i], ix[i]] = fcol[i]
    return out

Image.fromarray(render(True)).save("uvcheck2-front.png")
Image.fromarray(render(False)).save("uvcheck2-back.png")
print("faces", len(tris), "-> wrote uvcheck2-front.png / uvcheck2-back.png")
