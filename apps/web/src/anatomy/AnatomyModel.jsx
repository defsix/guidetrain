import React, { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { bakeVertexZones, computeZoneBoundaryEdges, pickZoneAtLocal, REGION_COLORS } from './zoneMapping';

const BASE = new THREE.Color('#8a5347');
const NEUTRAL = new THREE.Color('#33404f');
const DIM = new THREE.Color('#2a2320');
const HILITE = new THREE.Color('#ffd257');

// How far outline lines are lifted off the surface (native units) to avoid
// z-fighting with the mesh they trace.
const OUTLINE_LIFT = 0.0015;

/**
 * AnatomyModel — loads the fused GLB, bakes muscle zones, and handles
 * click / hover selection. Purely the 3D object; UI lives in AnatomyViewer.
 *
 * Props:
 *  url        model path (served from /public)
 *  map        muscle-map.json object
 *  selectedId currently selected zone id (or null)
 *  region     active region filter ('all' | 'Chest' | ...)
 *  onSelect(zone|null)
 *  onHover(zone|null)
 */
export default function AnatomyModel({ url, map, selectedId, region = 'all', onSelect, onHover }) {
  const { scene } = useGLTF(url);
  const meshRef = useRef();
  const hoverRef = useRef(null);

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

  // Bake zones once per geometry (heavy loop, memoized).
  const baked = useMemo(() => bakeVertexZones(geometry, map), [geometry, map]);

  // Clean traced lines along zone boundaries, instead of the jagged edge the
  // flat vertex-color fill leaves. Computed once; selection just swaps which
  // precomputed per-zone subset gets the brighter emphasis pass.
  const boundary = useMemo(
    () => computeZoneBoundaryEdges(geometry, baked, map, OUTLINE_LIFT),
    [geometry, baked, map]
  );
  const selectedBoundary = selectedId ? boundary.byZone[selectedId] : null;

  // Center the mesh at the origin (native scale preserved for correct picking).
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
    for (let i = 0; i < pos.count; i++) {
      let c = NEUTRAL;
      const zi = baked.vertZone[i];
      if (zi >= 0) {
        const reg = Z[zi].region;
        if (region === 'all' || reg === region) c = new THREE.Color(REGION_COLORS[reg]).lerp(BASE, 0.35);
        else c = DIM;
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    if (selectedId && baked.zoneVerts[selectedId]) {
      baked.zoneVerts[selectedId].forEach((i) => col.setXYZ(i, HILITE.r, HILITE.g, HILITE.b));
    }
    col.needsUpdate = true;
  };

  useLayoutEffect(paint, [selectedId, region, baked, geometry, map]);

  // Resolve a pointer event to a muscle zone using the native-space hit point.
  // meshRef can be transiently null between an outline-triggered re-render
  // and the mesh's own ref commit; treat that as "no zone" rather than throw.
  const zoneFromEvent = (e) => {
    if (!meshRef.current) return null;
    const lp = meshRef.current.worldToLocal(e.point.clone());
    return pickZoneAtLocal(lp.x, lp.y, lp.z, map, baked.localZ);
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
      <Outline points={boundary.all} color="#050708" opacity={0.45} />
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
