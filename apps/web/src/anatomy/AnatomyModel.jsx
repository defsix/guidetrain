import React, { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { bakeVertexZones, computeZoneBoundaryEdges, pickZoneAtFace, zoneColor } from './zoneMapping';

// Untrainable parts (head, hands, feet) and region-filtered-out muscles, per
// theme — a mid grey that reads as "inactive" against either background.
const INACTIVE = {
  dark: { neutral: '#4a5361', dim: '#2f353f', outline: '#05070a' },
  light: { neutral: '#b6bec9', dim: '#cdd3db', outline: '#2c3440' },
};
const HILITE = new THREE.Color('#ffffff');

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
export default function AnatomyModel({ url, map, theme = 'dark', selectedId, region = 'all', onSelect, onHover }) {
  const { scene } = useGLTF(url);
  const meshRef = useRef();
  const hoverRef = useRef(null);
  const palette = INACTIVE[theme] || INACTIVE.dark;

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
    const neutral = new THREE.Color(palette.neutral);
    const dim = new THREE.Color(palette.dim);
    for (let i = 0; i < pos.count; i++) {
      let c = neutral;
      const zi = baked.vertZone[i];
      const zone = zi >= 0 ? Z[zi] : null;
      // Hands, feet and head aren't trainable groups — leave them neutral.
      if (zone && zone.selectable !== false) {
        if (region === 'all' || zone.region === region) c = new THREE.Color(zoneColor(zone));
        else c = dim;
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    // Selection brightens the muscle's own colour rather than replacing it, so
    // it stays identifiable while clearly standing out.
    if (selectedId && baked.zoneVerts[selectedId]) {
      const zone = Z.find((z) => z.id === selectedId);
      const c = new THREE.Color(zoneColor(zone)).lerp(HILITE, 0.45);
      baked.zoneVerts[selectedId].forEach((i) => col.setXYZ(i, c.r, c.g, c.b));
    }
    col.needsUpdate = true;
  };

  useLayoutEffect(paint, [selectedId, region, baked, geometry, map, theme]);

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
      {selectedBoundary && <Outline points={selectedBoundary} color="#fff4d6" opacity={0.95} />}
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
