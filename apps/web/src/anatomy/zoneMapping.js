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

/**
 * Trace clean boundary lines between muscle zones (and between a zone and
 * unzoned surface), instead of relying on the jagged edge the flat
 * per-vertex zone fill leaves wherever a zone's spatial box happens to cut
 * across the mesh at an angle.
 *
 * A mesh edge is a "boundary" edge when its two endpoints fall in different
 * zones (including zoned vs. unzoned). The raw boundary is just as jagged as
 * the mesh's own vertex spacing, so it's smoothed afterward: boundary
 * vertices form chains (a vertex with exactly two boundary-neighbors is an
 * interior chain point), and each chain point is iteratively pulled toward
 * its neighbors' midpoint. Junctions — one or three-plus neighbors, e.g.
 * where three zones meet — are left as fixed anchors so chains don't detach
 * from each other or from the surface.
 *
 * @returns { all: Float32Array, byZone: {id: Float32Array} } — each is a
 * flat [x,y,z, x,y,z, ...] position list for a THREE.LineSegments geometry.
 */
export function computeZoneBoundaryEdges(geometry, baked, map, liftEps = 0, smoothIterations = 12) {
  const index = geometry.index;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const vertZone = baked.vertZone;
  const Z = map.zones;

  // Nudge a point slightly along its vertex normal so the line sits just
  // above the surface instead of z-fighting with the mesh it traces.
  function liftedPoint(i) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (!normal || !liftEps) return [x, y, z];
    return [x + normal.getX(i) * liftEps, y + normal.getY(i) * liftEps, z + normal.getZ(i) * liftEps];
  }

  // Phase 1: find every boundary edge and which zone(s) it borders.
  const seen = new Set();
  const edges = []; // [a, b] mesh vertex indices
  const edgeZoneIds = []; // parallel: [zoneIdOrNull, zoneIdOrNull]
  const boundaryVerts = new Set();
  const adjacency = new Map(); // vertex index -> Set of boundary-neighbor indices

  function link(a, b) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  }

  function addEdge(a, b) {
    const za = vertZone[a], zb = vertZone[b];
    if (za === zb) return; // interior edge, not a zone boundary
    const key = a < b ? a * 1e7 + b : b * 1e7 + a;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([a, b]);
    edgeZoneIds.push([za >= 0 ? Z[za].id : null, zb >= 0 ? Z[zb].id : null]);
    boundaryVerts.add(a);
    boundaryVerts.add(b);
    link(a, b);
    link(b, a);
  }

  if (index) {
    const idx = index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      addEdge(a, b); addEdge(b, c); addEdge(c, a);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      addEdge(i, i + 1); addEdge(i + 1, i + 2); addEdge(i + 2, i);
    }
  }

  // Phase 2: smooth boundary-vertex positions along their local chain.
  let smoothed = new Map();
  for (const v of boundaryVerts) smoothed.set(v, liftedPoint(v));
  for (let iter = 0; iter < smoothIterations; iter++) {
    const next = new Map();
    for (const v of boundaryVerts) {
      const neighbors = adjacency.get(v);
      let mx = 0, my = 0, mz = 0;
      for (const n of neighbors) {
        const p = smoothed.get(n);
        mx += p[0]; my += p[1]; mz += p[2];
      }
      const k = neighbors.size;
      const p = smoothed.get(v);
      next.set(v, [
        p[0] * 0.5 + (mx / k) * 0.5,
        p[1] * 0.5 + (my / k) * 0.5,
        p[2] * 0.5 + (mz / k) * 0.5,
      ]);
    }
    smoothed = next;
  }

  // Phase 3: materialize segments from the smoothed positions.
  const allPts = [];
  const byZonePts = {};
  edges.forEach(([a, b], i) => {
    const pts = [...smoothed.get(a), ...smoothed.get(b)];
    allPts.push(...pts);
    const [zaId, zbId] = edgeZoneIds[i];
    if (zaId) (byZonePts[zaId] ??= []).push(...pts);
    if (zbId) (byZonePts[zbId] ??= []).push(...pts);
  });

  const byZone = {};
  for (const id in byZonePts) byZone[id] = new Float32Array(byZonePts[id]);
  return { all: new Float32Array(allPts), byZone };
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
