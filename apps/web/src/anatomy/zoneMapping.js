/**
 * zoneMapping.js — framework-agnostic muscle zone logic.
 *
 * Which muscle a point belongs to is decided when the model is built, not at
 * runtime: the segmentation pipeline reads the colour the artist painted each
 * muscle in the source texture, grows that into whole muscle regions across the
 * mesh, and bakes the resulting zone index onto every vertex as the model's
 * `_ZONE` attribute. So a lookup here is just reading that number.
 *
 * This replaces the earlier approach of approximating each muscle with an
 * axis-aligned box in normalised body space. Boxes inevitably overlapped —
 * an arm box would reach across the torso and claim part of the back — so
 * boundaries drifted from the anatomy and had to be hand-tuned. Zone edges now
 * follow the artwork exactly, and a vertex belongs to exactly one muscle.
 */

/** Zone index baked onto each vertex, or null if the model lacks the attribute. */
export function zoneAttribute(geometry) {
  return geometry.attributes._zone || null;
}

/**
 * Bake per-vertex zone assignments.
 *
 * Kept as a function (rather than reading the attribute directly at each call
 * site) so callers get the same shape of result as before, and so a model
 * without the attribute fails loudly instead of silently colouring nothing.
 *
 * @returns { vertZone: Int16Array, zoneVerts: {id: number[]} }
 */
export function bakeVertexZones(geometry, map) {
  const attr = zoneAttribute(geometry);
  if (!attr) {
    throw new Error(
      'Model has no _ZONE attribute — it predates the segmented muscle pipeline.'
    );
  }
  const n = attr.count;
  const zones = map.zones;
  const vertZone = new Int16Array(n);
  const zoneVerts = {};
  zones.forEach((z) => (zoneVerts[z.id] = []));

  for (let i = 0; i < n; i++) {
    const zi = attr.getX(i);
    const zone = zones[zi];
    // An out-of-range index means model and map are out of step; treat as unzoned.
    if (!zone) { vertZone[i] = -1; continue; }
    vertZone[i] = zi;
    zoneVerts[zone.id].push(i);
  }
  return { vertZone, zoneVerts };
}

/**
 * Resolve a picked triangle to its muscle zone.
 *
 * All three corners of a triangle usually share a zone; where they don't the
 * triangle straddles a boundary, and the nearest corner to the hit point wins.
 */
export function pickZoneAtFace(geometry, map, faceIndices, point) {
  const attr = zoneAttribute(geometry);
  if (!attr || !faceIndices) return null;
  const pos = geometry.attributes.position;
  const [a, b, c] = faceIndices;

  let best = a, bestD = Infinity;
  for (const v of [a, b, c]) {
    const dx = pos.getX(v) - point.x;
    const dy = pos.getY(v) - point.y;
    const dz = pos.getZ(v) - point.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = v; }
  }
  const zone = map.zones[attr.getX(best)];
  if (!zone || zone.selectable === false) return null;
  return zone;
}

/**
 * Trace clean boundary lines between muscle zones, instead of the jagged edge
 * the flat per-vertex zone fill leaves along the triangle steps.
 *
 * A mesh edge is a boundary edge when its two endpoints fall in different
 * zones. The raw boundary is as jagged as the mesh's own vertex spacing, so
 * it's smoothed afterwards: boundary vertices form chains (a vertex with
 * exactly two boundary-neighbours is an interior chain point), and each chain
 * point is iteratively pulled toward its neighbours' midpoint. Junctions —
 * one, or three-plus neighbours, e.g. where three zones meet — stay fixed as
 * anchors so chains don't detach from each other or from the surface.
 *
 * @returns { all: Float32Array, byZone: {id: Float32Array} } — each a flat
 * [x,y,z, x,y,z, ...] position list for a THREE.LineSegments geometry.
 */
export function computeZoneBoundaryEdges(geometry, baked, map, liftEps = 0, smoothIterations = 12) {
  const index = geometry.index;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const vertZone = baked.vertZone;
  const Z = map.zones;

  function liftedPoint(i) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (!normal || !liftEps) return [x, y, z];
    return [x + normal.getX(i) * liftEps, y + normal.getY(i) * liftEps, z + normal.getZ(i) * liftEps];
  }

  const seen = new Set();
  const edges = [];
  const edgeZoneIds = [];
  const boundaryVerts = new Set();
  const adjacency = new Map();

  function link(a, b) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  }

  function addEdge(a, b) {
    const za = vertZone[a], zb = vertZone[b];
    if (za === zb) return;
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

/**
 * One colour per muscle, not per region.
 *
 * Colouring by region put five of seven regions in the red/orange family, so
 * neighbouring muscles were nearly the same shade and a whole leg or arm read
 * as one undifferentiated mass. These are spread around the hue circle instead,
 * and muscles that touch on the body are deliberately given distant hues so
 * every boundary is legible.
 *
 * Mid lightness and saturation throughout, so they hold up against both the
 * light and the dark canvas background.
 */
export const MUSCLE_COLORS = {
  // torso front
  pec: '#e04b3c',       // red
  abs: '#f5c451',       // amber
  obl: '#8e6bd8',       // purple
  // torso back
  lat: '#3f7fd0',       // blue
  erector: '#5b4bc4',   // blue-violet
  traps: '#16a394',     // teal
  delt: '#ffb020',      // yellow-orange
  // arms
  bic: '#37b26b',       // green
  tri: '#145f73',       // dark teal
  fore: '#cfa72e',      // gold
  // legs
  glute: '#e8559a',     // pink
  quad: '#3fb8d8',      // cyan
  ham: '#b5651d',       // bronze
  add: '#7fbf3f',       // green
  calf: '#2e8b57',      // sea green
  shin: '#f2994a',      // light orange
  // other
  neck: '#c98a6b',      // tan
};

/** Chip swatches in the region filter — one representative hue per region. */
export const REGION_COLORS = {
  Shoulders: '#ffb020', Chest: '#e04b3c', Back: '#3f7fd0',
  Arms: '#37b26b', Core: '#f5c451', Legs: '#3fb8d8', Neck: '#c98a6b',
};

/** Colour for a zone, falling back to its region if the muscle isn't listed. */
export function zoneColor(zone) {
  return MUSCLE_COLORS[zone.key] || REGION_COLORS[zone.region] || '#8a8f98';
}
