import { useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { MusclePart } from "../types";

const BASE_COLOR = "#9c2b3a";
const HOVER_COLOR = "#c8465a";
const SELECTED_COLOR = "#e8a23a";

interface Props {
  parts: MusclePart[];
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

export default function MuscleGroupMesh({ parts, isSelected, isHovered, onSelect, onHoverStart, onHoverEnd }: Props) {
  const geometries = useLoader(
    STLLoader,
    parts.map((p) => p.file)
  );

  const color = isSelected ? SELECTED_COLOR : isHovered ? HOVER_COLOR : BASE_COLOR;

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverStart();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverEnd();
        document.body.style.cursor = "default";
      }}
    >
      {geometries.map((geometry, i) => (
        <mesh key={parts[i].file} geometry={geometry}>
          <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}
