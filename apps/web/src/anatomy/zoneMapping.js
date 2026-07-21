/**
 * zoneMapping.js — framework-agnostic muscle zone logic.
 *
 * The anatomy model is a single fused mesh (no separable muscles), so we
 * select muscles by SPATIAL ZONES: each muscle group is a box in normalized
 * body coordinates (ny 0=feet..1=crown, nx -1..1 split0=R/L, nz -1..1 +1=front).
 *
 * Front/back is measured relative to a LOCAL center per height-slice, which
 * keeps limbs correct even in a contrapposto / arms-at-side pose.
 *
 * All coordinates are the model's NATIVE coordinates (as authored in the GLB);
 * map.fit_bounds describes that native bounding box.
 */

const SLICES = 48;

/** Normalize native (x,y,z) -> [nx, ny, nzLocal] using a precomputed localZ table. */
export function normOf(x, y, z, map, localZ) {
  const { min, max, size } = map.fit_bounds;
  const cx = (min[0] + max[0]) / 2;
  const czc = (min[2] + max[2]) / 2;
  const nx = (x - cx) / (size[0] / 2);
  const ny = (y - min[1]) / size[1];
  const nzr = (z - czc) / (size[2] / 2);
  const b = Math.max(0, Math.min(SLICES - 1, (ny * SLICES) | 0));
  return [nx, ny, nzr - localZ[b]];
}

/** Compute the median native-z per height slice (the "spine" of the body). */
function computeLocalZ(position, map) {
  const { min, max, size } = map.fit_bounds;
  const czc = (min[2] + max[2]) / 2;
  const buckets = Array.from({ length: SLICES }, () => []);
  const n = position.count;
  for (let i = 0; i < n; i++) {
    const y = position.getY(i), z = position.getZ(i);
    const ny = (y - min[1]) / size[1];
    const b = Math.max(0, Math.min(SLICES - 1, (ny * SLICES) | 0));
    buckets[b].push((z - czc) / (size[2] / 2));
  }
  const localZ = new Float32Array(SLICES);
  for (let b = 0; b < SLICES; b++) {
    const a = buckets[b];
    if (a.length) { a.sort((p, q) => p - q); localZ[b] = a[a.length >> 1]; }
  }
  return localZ;
}

function inZone(P, z) {
  return P[0] >= z.nx[0] && P[0] <= z.nx[1] &&
         P[1] >= z.ny[0] && P[1] <= z.ny[1] &&
         P[2] >= z.nz[0] && P[2] <= z.nz[1];
}

/**
 * Bake each vertex to its muscle zone.
 * @returns { localZ, vertZone: Int16Array, zoneVerts: {id: number[]} }
 */
export function bakeVertexZones(geometry, map) {
  const position = geometry.attributes.position;
  const n = position.count;
  const localZ = computeLocalZ(position, map);
  const Z = map.zones;

  const vertZone = new Int16Array(n).fill(-1);
  const bestPri = new Int8Array(n).fill(-1);
  const bestD = new Float32Array(n).fill(1e9);

  for (let i = 0; i < n; i++) {
    const P = normOf(position.getX(i), position.getY(i), position.getZ(i), map, localZ);
    for (let zi = 0; zi < Z.length; zi++) {
      const z = Z[zi];
      if (!inZone(P, z)) continue;
      const dx = P[0] - z.center[0], dy = P[1] - z.center[1], dz = P[2] - z.center[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (z.priority > bestPri[i] || (z.priority === bestPri[i] && d < bestD[i])) {
        bestPri[i] = z.priority; bestD[i] = d; vertZone[i] = zi;
      }
    }
  }

  const zoneVerts = {};
  Z.forEach((z) => (zoneVerts[z.id] = []));
  for (let i = 0; i < n; i++) if (vertZone[i] >= 0) zoneVerts[Z[vertZone[i]].id].push(i);

  return { localZ, vertZone, zoneVerts };
}

/** Given a native-space point, return the matching zone (or null). */
export function pickZoneAtLocal(px, py, pz, map, localZ) {
  const P = normOf(px, py, pz, map, localZ);
  const Z = map.zones;
  let best = null, bp = -1, bd = 1e9;
  for (let zi = 0; zi < Z.length; zi++) {
    const z = Z[zi];
    if (!inZone(P, z)) continue;
    const dx = P[0] - z.center[0], dy = P[1] - z.center[1], dz = P[2] - z.center[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (z.priority > bp || (z.priority === bp && d < bd)) { bp = z.priority; bd = d; best = z; }
  }
  return best;
}

/** Convert a normalized center back to native coords (for 3D labels / boxes). */
export function normToNative(nx, ny, nz, map) {
  const { min, max, size } = map.fit_bounds;
  const cx = (min[0] + max[0]) / 2, czc = (min[2] + max[2]) / 2;
  return [cx + nx * size[0] / 2, min[1] + ny * size[1], czc + nz * size[2] / 2];
}

export const REGION_COLORS = {
  Shoulders: '#ff8a5c', Chest: '#e8574a', Back: '#c73f6e',
  Arms: '#f2b13c', Core: '#d94436', Legs: '#b5503a', Neck: '#e06a4d',
};
