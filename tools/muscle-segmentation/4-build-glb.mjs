/**
 * Decimate the segmented mesh and write a GLB carrying a per-vertex zone id.
 *
 * meshopt's simplifier only ever collapses edges, so the surviving vertices are
 * a subset of the originals — the zone id each one carries stays valid without
 * any resampling.
 *
 * No UVs or textures are written: the viewer paints muscles from its own region
 * palette, so all the model needs to carry is geometry plus which zone each
 * vertex belongs to.
 */
import fs from "node:fs";
import { MeshoptSimplifier } from "/home/user/guidetrain/node_modules/meshoptimizer/index.js";

await MeshoptSimplifier.ready;

const meta = JSON.parse(fs.readFileSync("exp_meta.json", "utf8"));
const NV = meta.verts;
const pos  = new Float32Array(fs.readFileSync("exp_pos.bin").buffer.slice(0));
const nrm  = new Float32Array(fs.readFileSync("exp_nrm.bin").buffer.slice(0));
const zone = new Uint8Array(fs.readFileSync("exp_zone.bin").buffer.slice(0));
const idx  = new Uint32Array(fs.readFileSync("exp_idx.bin").buffer.slice(0));
console.log(`in: ${NV} verts, ${idx.length / 3} tris, ${meta.zones} zones`);

function build(targetTris, error, outName) {
  const [simplified, err] = MeshoptSimplifier.simplify(
    idx, pos, 3, targetTris * 3, error, ["LockBorder"]);
  console.log(`${outName}: ${simplified.length / 3} tris (err ${err.toFixed(5)})`);

  // Give every triangle a single zone, then split vertices so no triangle
  // straddles two. Without this a boundary triangle has corners in different
  // zones and the shader blends between their colours, smearing every muscle
  // edge into a wide gradient instead of a clean line.
  const triCount = simplified.length / 3;
  const triZone = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = zone[simplified[t*3]], b = zone[simplified[t*3+1]], c = zone[simplified[t*3+2]];
    // majority; with three different zones take the lowest for determinism
    triZone[t] = (a === b || a === c) ? a : (b === c ? b : Math.min(a, b, c));
  }

  // Smooth the borders, here rather than before decimating.
  //
  // A border is where two painted colours met on a noisy texture, so it starts
  // out as sawtooth; then decimation makes each triangle nine times larger and
  // every wobble becomes a visible spike. Smoothing the fine mesh barely helps
  // because the coarse mesh is re-cut from it anyway — the border has to be
  // settled on the triangles that are actually drawn.
  //
  // Each triangle takes whichever zone covers the most area among itself and
  // the three it shares an edge with. A spike disagrees with all three
  // neighbours and is rounded off; a straight border has as much of itself on
  // each side and holds. It also clears up the three-way ties above, which
  // otherwise resolve by zone number — an alphabetical accident, not geometry.
  const triArea = new Float32Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const i = simplified[t*3]*3, j = simplified[t*3+1]*3, k = simplified[t*3+2]*3;
    const ux = pos[j]-pos[i], uy = pos[j+1]-pos[i+1], uz = pos[j+2]-pos[i+2];
    const vx = pos[k]-pos[i], vy = pos[k+1]-pos[i+1], vz = pos[k+2]-pos[i+2];
    const cx = uy*vz-uz*vy, cy = uz*vx-ux*vz, cz = ux*vy-uy*vx;
    triArea[t] = Math.hypot(cx, cy, cz) * 0.5;
  }
  // triangles sharing an edge
  const edge = new Map(), nbrA = [], nbrB = [];
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const p = simplified[t*3+k], q = simplified[t*3+(k+1)%3];
      const kk = p < q ? `${p}_${q}` : `${q}_${p}`;
      const prev = edge.get(kk);
      if (prev === undefined) edge.set(kk, t);
      else { nbrA.push(prev, t); nbrB.push(t, prev); }
    }
  }
  // Pair each triangle with the one nearest its own mirrored position, so the
  // two sides are smoothed as one. Left and right are not decimated to the same
  // triangles, so smoothing them independently lets them drift apart — doing
  // that cost the labelling most of its symmetry until the pairing went in.
  const cen = new Float64Array(triCount * 3);
  let xlo = Infinity, xhi = -Infinity, edgeSum = 0;
  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++)
      cen[t*3+c] = (pos[simplified[t*3]*3+c] + pos[simplified[t*3+1]*3+c] + pos[simplified[t*3+2]*3+c]) / 3;
    if (cen[t*3] < xlo) xlo = cen[t*3];
    if (cen[t*3] > xhi) xhi = cen[t*3];
    edgeSum += Math.sqrt(triArea[t]);
  }
  const xmid = (xlo + xhi) / 2, cell = Math.max(2 * edgeSum / triCount, 1e-4);
  const grid = new Map();
  const ckey = (x, y, z) =>
    `${Math.floor(x/cell)}_${Math.floor(y/cell)}_${Math.floor(z/cell)}`;
  for (let t = 0; t < triCount; t++) {
    const k = ckey(cen[t*3], cen[t*3+1], cen[t*3+2]);
    const b = grid.get(k); if (b) b.push(t); else grid.set(k, [t]);
  }
  const mirror = new Int32Array(triCount).fill(-1);
  for (let t = 0; t < triCount; t++) {
    const mx = 2*xmid - cen[t*3], my = cen[t*3+1], mz = cen[t*3+2];
    let best = -1, bd = Infinity;
    const gx = Math.floor(mx/cell), gy = Math.floor(my/cell), gz = Math.floor(mz/cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const bucket = grid.get(`${gx+a}_${gy+b}_${gz+c}`);
      if (!bucket) continue;
      for (const s of bucket) {
        const d = (cen[s*3]-mx)**2 + (cen[s*3+1]-my)**2 + (cen[s*3+2]-mz)**2;
        if (d < bd) { bd = d; best = s; }
      }
    }
    if (best >= 0 && bd < cell*cell) mirror[t] = best;
  }

  // Each zone is turned into a field that is 1 on its own triangles and 0
  // elsewhere, and those fields are blurred across the surface before the
  // winner is read off. Re-labelling by a straight majority vote instead stalls
  // almost at once — every triangle already agrees with most of its neighbours
  // while the border is still sawtooth — whereas blurring keeps shortening the
  // border for as long as it runs, which is what pulls a ragged edge into a
  // smooth curve.
  const NZONE = meta.zones, ALPHA = 0.5, PASSES = 24;
  let F = new Float32Array(triCount * NZONE);
  for (let t = 0; t < triCount; t++) F[t*NZONE + triZone[t]] = 1;
  const wsum = new Float64Array(triCount);
  for (let e = 0; e < nbrA.length; e++) wsum[nbrA[e]] += triArea[nbrB[e]];
  let G = new Float32Array(triCount * NZONE);
  for (let pass = 0; pass < PASSES; pass++) {
    G.fill(0);
    for (let e = 0; e < nbrA.length; e++) {
      const a = nbrA[e]*NZONE, b = nbrB[e]*NZONE, w = triArea[nbrB[e]];
      for (let z = 0; z < NZONE; z++) G[a+z] += F[b+z] * w;
    }
    for (let t = 0; t < triCount; t++) {
      const s = wsum[t] || 1;
      for (let z = 0; z < NZONE; z++)
        G[t*NZONE+z] = (1-ALPHA)*F[t*NZONE+z] + ALPHA*G[t*NZONE+z]/s;
    }
    // fold the two sides together so they can never drift apart
    for (let t = 0; t < triCount; t++) {
      const m = mirror[t];
      if (m > t) for (let z = 0; z < NZONE; z++) {
        const v = (G[t*NZONE+z] + G[m*NZONE+z]) / 2;
        G[t*NZONE+z] = v; G[m*NZONE+z] = v;
      }
    }
    const tmp = F; F = G; G = tmp;
  }
  for (let t = 0; t < triCount; t++) {
    let best = 0;
    for (let z = 1; z < NZONE; z++) if (F[t*NZONE+z] > F[t*NZONE+best]) best = z;
    triZone[t] = best;
  }
  {
    let seam = 0;
    for (let e = 0; e < nbrA.length; e += 2) if (triZone[nbrA[e]] !== triZone[nbrB[e]]) seam++;
    console.log(`  ${seam} border edges after smoothing`);
  }

  const key = new Map();          // `${vertex}:${zone}` -> new index
  const srcOf = [];
  const I32 = new Uint32Array(simplified.length);
  for (let t = 0; t < triCount; t++) {
    const z = triZone[t];
    for (let k = 0; k < 3; k++) {
      const v = simplified[t*3+k];
      const kk = v * 256 + z;
      let idx = key.get(kk);
      if (idx === undefined) { idx = srcOf.length; key.set(kk, idx); srcOf.push(v); }
      I32[t*3+k] = idx;
    }
  }
  const n = srcOf.length;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Z = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    const v = srcOf[r];
    P[r*3] = pos[v*3]; P[r*3+1] = pos[v*3+1]; P[r*3+2] = pos[v*3+2];
    N[r*3] = nrm[v*3]; N[r*3+1] = nrm[v*3+1]; N[r*3+2] = nrm[v*3+2];
  }
  for (let t = 0; t < triCount; t++)
    for (let k = 0; k < 3; k++) Z[I32[t*3+k]] = triZone[t];

  const use16 = n < 65536;
  const I = use16 ? new Uint16Array(I32) : I32;
  console.log(`  ${n} verts after zone split, ${use16 ? "uint16" : "uint32"} indices`);

  // --- assemble GLB ---
  const parts = [], views = [], accs = [];
  let off = 0;
  const pad4 = (x) => (x + 3) & ~3;
  function addView(buf) {
    const start = pad4(off);
    if (start > off) { parts.push(Buffer.alloc(start - off)); off = start; }
    parts.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.byteLength });
    off += buf.byteLength;
    return views.length - 1;
  }
  const mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const v = P[i*3+c];
    if (v < mn[c]) mn[c] = v;
    if (v > mx[c]) mx[c] = v;
  }
  accs.push({ bufferView: addView(P), componentType: 5126, count: n, type: "VEC3", min: mn, max: mx });
  accs.push({ bufferView: addView(N), componentType: 5126, count: n, type: "VEC3" });
  accs.push({ bufferView: addView(Z), componentType: 5121, count: n, type: "SCALAR" });
  accs.push({ bufferView: addView(I), componentType: use16 ? 5123 : 5125, count: I.length, type: "SCALAR" });

  const json = {
    asset: { version: "2.0", generator: "guidetrain segment pipeline" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, _ZONE: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: "muscle", pbrMetallicRoughness: {
      baseColorFactor: [1,1,1,1], metallicFactor: 0, roughnessFactor: 0.7 } }],
    accessors: accs, bufferViews: views, buffers: [{ byteLength: off }],
  };

  const bin = Buffer.concat(parts);
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - jsonBuf.length % 4, 0x20)]);
  const binPad = bin.length % 4 ? Buffer.alloc(4 - bin.length % 4) : Buffer.alloc(0);
  const total = 12 + 8 + jsonBuf.length + 8 + bin.length + binPad.length;
  const head = Buffer.alloc(12); head.write("glTF", 0, "ascii");
  head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  fs.writeFileSync(outName, Buffer.concat([head, jh, jsonBuf, bh, bin, binPad]));
  console.log(`  wrote ${outName} ${(fs.statSync(outName).size/1048576).toFixed(2)} MB`);
}

build(60000,  0.02, "anatomy_mobile.glb");
build(150000, 0.01, "anatomy_full.glb");
