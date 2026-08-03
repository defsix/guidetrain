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

  // compact to only the vertices still referenced
  const remap = new Int32Array(NV).fill(-1);
  let n = 0;
  for (const v of simplified) if (remap[v] < 0) remap[v] = n++;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Z = new Uint8Array(n);
  for (let v = 0; v < NV; v++) {
    const r = remap[v];
    if (r < 0) continue;
    P[r*3] = pos[v*3]; P[r*3+1] = pos[v*3+1]; P[r*3+2] = pos[v*3+2];
    N[r*3] = nrm[v*3]; N[r*3+1] = nrm[v*3+1]; N[r*3+2] = nrm[v*3+2];
    Z[r] = zone[v];
  }
  const use16 = n < 65536;
  const I = use16 ? new Uint16Array(simplified.length) : new Uint32Array(simplified.length);
  for (let i = 0; i < simplified.length; i++) I[i] = remap[simplified[i]];
  console.log(`  ${n} verts, ${use16 ? "uint16" : "uint32"} indices`);

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
