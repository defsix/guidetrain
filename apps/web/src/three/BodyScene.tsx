import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import MuscleGroupMesh from "./MuscleGroupMesh";
import type { MuscleGroupManifestEntry } from "../types";

interface Props {
  selectedSlug: string | null;
  onSelectSlug: (slug: string) => void;
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="three-loading">Loading anatomical model…</div>
    </Html>
  );
}

function FitCameraToGroup({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(groupRef.current);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.6;

    camera.position.set(center.x, center.y + size.y * 0.05, center.z + distance);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = distance / 100;
      camera.far = distance * 10;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(center);

    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }, [groupRef, camera, controls]);

  return null;
}

export default function BodyScene({ selectedSlug, onSelectSlug }: Props) {
  const [manifest, setManifest] = useState<MuscleGroupManifestEntry[] | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}models/muscle-groups-manifest.json`)
      .then((res) => res.json())
      .then(setManifest);
  }, []);

  return (
    <Canvas camera={{ fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#101014"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} />
      <directionalLight position={[0, -3, 2]} intensity={0.3} />
      <Suspense fallback={<LoadingFallback />}>
        {manifest && (
          <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]} scale={0.001}>
            {manifest.map((group) => (
              <MuscleGroupMesh
                key={group.slug}
                parts={group.parts}
                isSelected={selectedSlug === group.slug}
                isHovered={hoveredSlug === group.slug}
                onSelect={() => onSelectSlug(group.slug)}
                onHoverStart={() => setHoveredSlug(group.slug)}
                onHoverEnd={() => setHoveredSlug((s) => (s === group.slug ? null : s))}
              />
            ))}
          </group>
        )}
        {manifest && <FitCameraToGroup groupRef={groupRef} />}
      </Suspense>
      <OrbitControls makeDefault enablePan={false} minDistance={0.5} maxDistance={6} />
    </Canvas>
  );
}
