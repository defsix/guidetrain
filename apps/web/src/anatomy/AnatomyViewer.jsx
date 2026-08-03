import React, { useState, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import AnatomyModel from './AnatomyModel';
import EnvironmentBoundary from './EnvironmentBoundary';
import defaultMap from './muscle-map.json';
import './anatomy.css';

const REGIONS = ['all', 'Shoulders', 'Chest', 'Back', 'Arms', 'Core', 'Legs'];
const REGION_DOT = {
  all: '#4cc9ff', Shoulders: '#ff8a5c', Chest: '#e8574a',
  Back: '#c73f6e', Arms: '#f2b13c', Core: '#d94436', Legs: '#b5503a',
};

/**
 * AnatomyViewer — drop-in interactive muscle picker.
 *
 * <AnatomyViewer
 *    modelUrl="/models/anatomy_mobile.glb"
 *    onTrain={(muscle) => addToWorkout(muscle)}
 * />
 *
 * Also fires a window event: window.addEventListener('muscle:train', e => e.detail)
 */
// Scene colours per theme. The 3D canvas can't read CSS variables, so the
// resolved theme is passed in and mapped to real colours here.
const SCENE = {
  dark: {
    bg: '#0b0d12', fog: ['#0b0d12', 4, 11],
    ambient: ['#5d6b85', 1.05],
    key: ['#ffffff', 1.25], fill: ['#7fb2ff', 0.55],
  },
  light: {
    bg: '#e8ebf0', fog: ['#e8ebf0', 5, 13],
    ambient: ['#ffffff', 1.5],
    key: ['#ffffff', 1.5], fill: ['#c9d6ea', 0.7],
  },
};

export default function AnatomyViewer({
  modelUrl = '/models/anatomy_mobile.glb',
  map = defaultMap,
  theme = 'dark',
  onTrain,
  onSelect,
}) {
  const scene = SCENE[theme] || SCENE.dark;
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [region, setRegion] = useState('all');
  const [autoRotate, setAutoRotate] = useState(false);

  const handleSelect = useCallback((z) => { setSelected(z); onSelect && onSelect(z); }, [onSelect]);

  const train = () => {
    if (!selected) return;
    const detail = { id: selected.id, name: selected.name, region: selected.region };
    window.dispatchEvent(new CustomEvent('muscle:train', { detail }));
    onTrain && onTrain(detail);
  };

  return (
    <div className="anatomy-root">
      <Canvas camera={{ position: [0, 0.2, 3.4], fov: 42 }} dpr={[1, 2]}>
        <color attach="background" args={[scene.bg]} />
        <fog attach="fog" args={scene.fog} />
        <ambientLight intensity={scene.ambient[1]} color={scene.ambient[0]} />
        <directionalLight position={[4, 6, 8]} intensity={scene.key[1]} color={scene.key[0]} />
        <directionalLight position={[-6, 3, -5]} intensity={scene.fill[1]} color={scene.fill[0]} />
        <Suspense fallback={null}>
          <AnatomyModel
            url={modelUrl}
            map={map}
            theme={theme}
            selectedId={selected?.id || null}
            region={region}
            onSelect={handleSelect}
            onHover={setHover}
          />
          <EnvironmentBoundary>
            <Suspense fallback={null}>
              <Environment preset="city" />
            </Suspense>
          </EnvironmentBoundary>
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={1.6}
          maxDistance={7}
          autoRotate={autoRotate}
          autoRotateSpeed={0.8}
          target={[0, 0, 0]}
        />
      </Canvas>

      {/* Region filter */}
      <div className="anatomy-panel regions">
        <h2>Muscle Groups</h2>
        {REGIONS.map((r) => (
          <button
            key={r}
            className={`chip ${region === r ? 'active' : ''}`}
            onClick={() => setRegion(r)}
          >
            <span>{r === 'all' ? 'All' : r}</span>
            <span className="dot" style={{ background: REGION_DOT[r] }} />
          </button>
        ))}
      </div>

      {/* Display controls */}
      <div className="anatomy-panel controls">
        <h2>Display</h2>
        <label className="toggle-row">
          <span>Auto-rotate</span>
          <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
        </label>
      </div>

      {/* Hover tooltip */}
      {hover && <div className="anatomy-hover">{hover.name}</div>}

      {/* Selection readout */}
      {selected && (
        <div className="anatomy-readout">
          <div className="body">
            <div className="mname">{selected.name}</div>
            <div className="mmeta">{selected.region}</div>
            <div className="mdesc">{selected.desc}</div>
          </div>
          <button className="train-btn" onClick={train}>Train this</button>
        </div>
      )}
    </div>
  );
}
