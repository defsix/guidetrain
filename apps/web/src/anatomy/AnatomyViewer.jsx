import React, { useState, useCallback, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import AnatomyModel from './AnatomyModel';
import EnvironmentBoundary from './EnvironmentBoundary';
import defaultMap from './muscle-map.json';
import { zoneColor } from './zoneMapping';
import './anatomy.css';

// Regions top to bottom, and the muscles within each in the order they sit on
// the body. The palette is tuned against this order: two swatches listed one
// above the other have to be tellable apart even when the muscles are nowhere
// near each other, so the order is part of the design, not decoration.
const REGION_ORDER = ['Neck', 'Shoulders', 'Chest', 'Back', 'Arms', 'Core', 'Legs'];
const MUSCLE_ORDER = [
  'neck', 'traps', 'delt', 'pec', 'lat', 'erector',
  'bic', 'tri', 'fore', 'abs', 'obl',
  'glute', 'quad', 'add', 'ham', 'calf', 'shin',
];

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

  const selectable = useMemo(
    () => map.zones.filter((z) => z.selectable !== false),
    [map],
  );
  const byRegion = useMemo(() => {
    const rank = (z) => {
      const i = MUSCLE_ORDER.indexOf(z.key ?? z.id);
      return i === -1 ? MUSCLE_ORDER.length : i;
    };
    return REGION_ORDER
      .map((r) => [r, selectable.filter((z) => z.region === r).sort((a, b) => rank(a) - rank(b))])
      .filter(([, ms]) => ms.length);
  }, [selectable]);

  const handleSelect = useCallback((z) => {
    setSelected(z);
    // Picking a muscle from outside the current filter would otherwise select
    // something the model is showing greyed out, so the filter steps aside.
    if (z && region !== 'all' && z.region !== region) setRegion('all');
    onSelect && onSelect(z);
  }, [onSelect, region]);

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

      {/* Every muscle on the model, grouped by region. The swatches are the
          model's own colours, so the list doubles as the legend. */}
      <div className="anatomy-panel regions">
        <h2>Muscle Groups</h2>
        <div className="muscle-list">
          <button
            className={`chip all ${region === 'all' ? 'active' : ''}`}
            onClick={() => { setRegion('all'); handleSelect(null); }}
          >
            <span>All muscles</span>
            <span className="count">{selectable.length}</span>
          </button>
          {byRegion.map(([r, muscles]) => (
            <div className="region-group" key={r}>
              <button
                className={`region-head ${region === r ? 'active' : ''}`}
                onClick={() => setRegion(region === r ? 'all' : r)}
              >
                {r}
              </button>
              {muscles.map((z) => (
                <button
                  key={z.id}
                  className={`muscle ${selected?.id === z.id ? 'active' : ''}`}
                  onClick={() => handleSelect(selected?.id === z.id ? null : z)}
                  onMouseEnter={() => setHover(z)}
                  onMouseLeave={() => setHover(null)}
                  title={z.desc}
                >
                  <span className="dot" style={{ background: zoneColor(z) }} />
                  <span className="mlabel">{z.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
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
