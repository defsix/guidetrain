import React, { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { bakeVertexZones, computeZoneBoundaryEdges, pickZoneAtFace } from './zoneMapping';

/**
 * The body is one colour until you ask it a question.
 *
 * It used to arrive wearing seventeen — a distinct hue per muscle, doubling as
 * the picker's legend. That showed everything at once and therefore emphasised
 * nothing: a body already lit up in every direction has no way left to answer
 * "which one is the quadriceps", because the answer was already on screen along
 * with sixteen others. Traced borders still show where each muscle begins, so
 * the map is not lost — only the shouting.
 *
 * `accent` is the theme's own orange, the same one the buttons use, copied here
 * because the 3D canvas can't read CSS custom properties. `second` is that
 * orange pulled back toward the body, for a muscle an exercise works but isn't
 * about.
 */
const BODY = {
  dark: { base: '#59626f', dim: '#2f353f', accent: '#f97316', outline: '#05070a' },
  light: { base: '#b6bec9', dim: '#cdd3db', accent: '#c2410c', outline: '#2c3440' },
};

// How far outline lines are lifted off the surface (native units) to avoid
// z-fighting with the mesh they trace.
const OUTLINE_LIFT = 0.0015;

/**
 * AnatomyModel — loads the segmented GLB, paints muscle zones, and handles
 * click / hover selection. Purely the 3D object; UI lives in AnatomyViewer.
 *
 * Which muscle each vertex belongs to is baked into the model itself (see
 * zoneMapping.js), so selection is a direct lookup rather than a spatial test.
 *
 * Props:
 *  url        model path (served from /public)
 *  map        muscle-map.json object
 *  selectedId currently selected zone id (or null)
 *  region     active region filter ('all' | 'Chest' | ...)
 *  onSelect(zone|null)
 *  onHover(zone|null)
 */
export default function AnatomyModel({ url, map, theme = 'dark', selectedId, region = 'all', exercise = null, onSelect, onHover, onReady }) {
  const { scene } = useGLTF(url);
  const meshRef = useRef();
  const hoverRef = useRef(null);
  const palette = BODY[theme] || BODY.dark;

  // Find the first mesh in the GLB and give it a fresh vertex-color material.
  const { geometry, material } = useMemo(() => {
    let found = null;
    scene.traverse((o) => { if (o.isMesh && !found) found = o; });
    const geo = found.geometry;
    if (!geo.attributes.color) {
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.04 });
    return { geometry: geo, material: mat };
  }, [scene]);

  const baked = useMemo(() => bakeVertexZones(geometry, map), [geometry, map]);

  // Clean traced lines along zone boundaries, instead of the jagged edge the
  // flat vertex-color fill leaves. Computed once; selection just swaps which
  // precomputed per-zone subset gets the brighter emphasis pass.
  const boundary = useMemo(
    () => computeZoneBoundaryEdges(geometry, baked, map, OUTLINE_LIFT),
    [geometry, baked, map]
  );
  const selectedBoundary = selectedId ? boundary.byZone[selectedId] : null;

  // Centre the mesh at the origin. The export pipeline already normalises the
  // model to the height the camera in AnatomyViewer is framed for, so there's
  // nothing to rescale here.
  const offset = useMemo(() => {
    geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    geometry.boundingBox.getCenter(c);
    return c;
  }, [geometry]);

  // Paint vertex colors from current selection + region.
  const paint = () => {
    const col = geometry.attributes.color;
    const pos = geometry.attributes.position;
    const Z = map.zones;
    const base = new THREE.Color(palette.base);
    const dim = new THREE.Color(palette.dim);
    const accent = new THREE.Color(palette.accent);
    // A supporting muscle is the accent pulled most of the way back to the
    // body: clearly involved, clearly not the point. Derived rather than a
    // fourth hand-picked colour, so it tracks the accent in both themes.
    const second = accent.clone().lerp(base, 0.62);
    // An exercise takes over the whole body: everything it trains is lit and
    // everything else drops back, so what the movement works is legible at a
    // glance. This is the illustration for an exercise — the app's own model
    // rather than a stock photo of somebody lifting.
    const prim = exercise ? new Set(exercise.primary || []) : null;
    const sec = exercise ? new Set(exercise.secondary || []) : null;
    const filtering = !exercise && region !== 'all';

    for (let i = 0; i < pos.count; i++) {
      const zi = baked.vertZone[i];
      const zone = zi >= 0 ? Z[zi] : null;
      // Hands, feet and head aren't trainable, so they are never the answer to
      // anything; they fall back with everything else that isn't being asked
      // about, and wear the plain body colour when nothing is.
      const trainable = zone && zone.selectable !== false;
      let c;
      if (exercise) {
        if (trainable && prim.has(zone.key)) c = accent;
        else if (trainable && sec.has(zone.key)) c = second;
        else c = dim;
      } else if (filtering) {
        c = trainable && zone.region === region ? base : dim;
      } else {
        c = base;
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    // The chosen muscle is the one thing on the body wearing a colour, which is
    // what makes it findable at a glance from across the picker.
    if (!exercise && selectedId && baked.zoneVerts[selectedId]) {
      baked.zoneVerts[selectedId].forEach((i) => col.setXYZ(i, accent.r, accent.g, accent.b));
    }
    col.needsUpdate = true;
  };

  useLayoutEffect(paint, [selectedId, region, exercise, baked, geometry, map, theme]);

  // Resolve a pointer event to a muscle zone via the picked triangle's
  // baked zone ids. meshRef can be transiently null between an
  // outline-triggered re-render and the mesh's own ref commit; treat that as
  // "no zone" rather than throw.
  const zoneFromEvent = (e) => {
    if (!meshRef.current || !e.face) return null;
    const lp = meshRef.current.worldToLocal(e.point.clone());
    return pickZoneAtFace(geometry, map, [e.face.a, e.face.b, e.face.c], lp);
  };

  const handleMove = (e) => {
    e.stopPropagation();
    const z = zoneFromEvent(e);
    const id = z ? z.id : null;
    if (id !== hoverRef.current) { hoverRef.current = id; onHover && onHover(z); }
  };
  const handleClick = (e) => { e.stopPropagation(); onSelect && onSelect(zoneFromEvent(e)); };
  const handleOut = () => { hoverRef.current = null; onHover && onHover(null); };

  useEffect(() => () => useGLTF.clear?.(url), [url]);

  // useGLTF suspends, so reaching this point means the model is decoded and
  // painted. That is the honest moment to drop the loading overlay — the
  // environment map may still be in flight, but the body is already there.
  useEffect(() => { onReady && onReady(); }, [onReady]);

  const groupPosition = [-offset.x, -offset.y, -offset.z];

  return (
    <group position={groupPosition}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
        onClick={handleClick}
      />
      <Outline points={boundary.all} color={palette.outline} opacity={theme === "light" ? 0.6 : 0.5} />
      {selectedBoundary && <Outline points={selectedBoundary} color={palette.outline} opacity={0.85} />}
    </group>
  );
}

/** Thin traced line along a flat [x,y,z, x,y,z, ...] segment list. */
function Outline({ points, color, opacity }) {
  if (!points || points.length === 0) return null;
  return (
    <lineSegments raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}
