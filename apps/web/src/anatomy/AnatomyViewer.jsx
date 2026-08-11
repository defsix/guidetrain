import React, { useState, useCallback, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import AnatomyModel from './AnatomyModel';
import EnvironmentBoundary from './EnvironmentBoundary';
import defaultMap from './muscle-map.json';
import { zoneColor } from './zoneMapping';
import exerciseData from './exercises.json';
import VideoModal from './VideoModal';
import { useI18n } from '../i18n/I18nProvider';
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
  const { t, localizeExercise } = useI18n();
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [region, setRegion] = useState('all');
  const [autoRotate, setAutoRotate] = useState(false);
  const [openDrill, setOpenDrill] = useState(null);
  const [video, setVideo] = useState(null);
  // Which floating panel is open on a phone. Both are always on screen at
  // desktop widths; below 720px they would cover the model, so they start
  // closed and open one at a time from the toolbar.
  const [panel, setPanel] = useState(null);
  // The model is 1.1 MB, so on a cold connection the canvas is empty for a
  // noticeable stretch. Say so rather than showing an empty stage.
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);

  // Exercises for the selected muscle, and the one whose detail is open — that
  // one is painted onto the model so you can see what the movement trains.
  const drills = useMemo(
    () => (selected ? exerciseData.muscles[selected.key] || [] : []).map(localizeExercise),
    [selected, localizeExercise],
  );
  const shownDrill = useMemo(
    () => drills.find((x) => x.id === openDrill) || null,
    [drills, openDrill],
  );

  // The map ships English. Its text is looked up by zone key and falls back to
  // whatever the map itself says, so a zone added to the model before it has
  // been translated still shows a real name rather than a missing-key stub.
  //
  // Region strings stay English *as keys* — they drive the filter and are
  // compared against zone.region — and are translated only where drawn.
  const zoneName = useCallback((z) => t(`muscles.${z.key ?? z.id}.name`, undefined, z.name), [t]);
  const zoneDesc = useCallback((z) => t(`muscles.${z.key ?? z.id}.desc`, undefined, z.desc), [t]);
  const regionName = useCallback((r) => t(`regions.${r}`, undefined, r), [t]);

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
    setOpenDrill(null);
    // On a phone the picker sits over the model, so leaving it open would hide
    // the very muscle that was just chosen.
    if (z) setPanel(null);
    onSelect && onSelect(z);
  }, [onSelect, region]);

  const train = () => {
    if (!selected) return;
    // `name`/`region` stay English so a host app has a stable value to key on;
    // `label` is the same thing in the user's language, for display.
    const detail = {
      id: selected.id, name: selected.name, region: selected.region,
      label: zoneName(selected),
    };
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
            exercise={shownDrill}
            onSelect={handleSelect}
            onHover={setHover}
            onReady={handleReady}
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

      {!ready && (
        <div className="anatomy-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {t('viewer.loading')}
        </div>
      )}

      {/* Phone-only toolbar. The panels below overlay the model, which at this
          width leaves nothing to look at, so they are opened deliberately and
          only one at a time. Hidden at desktop widths, where both simply fit. */}
      <div className="anatomy-toolbar">
        <button
          className={`tool ${panel === 'regions' ? 'active' : ''}`}
          aria-expanded={panel === 'regions'}
          aria-controls="anatomy-regions"
          onClick={() => setPanel(panel === 'regions' ? null : 'regions')}
        >
          {t('viewer.muscleGroups')}
        </button>
        <button
          className={`tool ${panel === 'controls' ? 'active' : ''}`}
          aria-expanded={panel === 'controls'}
          aria-controls="anatomy-controls"
          onClick={() => setPanel(panel === 'controls' ? null : 'controls')}
        >
          {t('viewer.display')}
        </button>
      </div>

      {/* Tapping the model itself is the other way to dismiss an open panel. */}
      {panel && (
        <button
          className="anatomy-scrim"
          aria-label={t('viewer.closePanel')}
          onClick={() => setPanel(null)}
        />
      )}

      {/* Every muscle on the model, grouped by region. The swatches are the
          model's own colours, so the list doubles as the legend. */}
      <div id="anatomy-regions" className={`anatomy-panel regions ${panel === 'regions' ? 'open' : ''}`}>
        <h2>{t('viewer.muscleGroups')}</h2>
        <div className="muscle-list">
          <button
            className={`chip all ${region === 'all' ? 'active' : ''}`}
            onClick={() => { setRegion('all'); handleSelect(null); }}
          >
            <span>{t('viewer.allMuscles')}</span>
            <span className="count">{selectable.length}</span>
          </button>
          {byRegion.map(([r, muscles]) => (
            <div className="region-group" key={r}>
              <button
                className={`region-head ${region === r ? 'active' : ''}`}
                onClick={() => setRegion(region === r ? 'all' : r)}
              >
                {regionName(r)}
              </button>
              {muscles.map((z) => (
                <button
                  key={z.id}
                  className={`muscle ${selected?.id === z.id ? 'active' : ''}`}
                  onClick={() => handleSelect(selected?.id === z.id ? null : z)}
                  onMouseEnter={() => setHover(z)}
                  onMouseLeave={() => setHover(null)}
                  title={zoneDesc(z)}
                >
                  <span className="dot" style={{ background: zoneColor(z) }} />
                  <span className="mlabel">{zoneName(z)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Display controls */}
      <div id="anatomy-controls" className={`anatomy-panel controls ${panel === 'controls' ? 'open' : ''}`}>
        <h2>{t('viewer.display')}</h2>
        <label className="toggle-row">
          <span>{t('viewer.autoRotate')}</span>
          <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
        </label>
      </div>

      {video && <VideoModal exercise={video} onClose={() => setVideo(null)} />}

      {/* Hover tooltip */}
      {hover && <div className="anatomy-hover">{zoneName(hover)}</div>}

      {/* Selection readout, with the exercises that train this muscle */}
      {selected && (
        <div className="anatomy-readout">
          <div className="head">
            <div className="body">
              <div className="mname">{zoneName(selected)}</div>
              <div className="mmeta">{regionName(selected.region)}</div>
              <div className="mdesc">{zoneDesc(selected)}</div>
            </div>
            <button className="train-btn" onClick={train}>{t('viewer.trainThis')}</button>
          </div>

          {drills.length > 0 && (
            <div className="drills">
              <h3>{t('viewer.exercises', { count: drills.length })}</h3>
              <ul>
                {drills.map((x) => {
                  const open = openDrill === x.id;
                  return (
                    <li key={x.id} className={open ? 'open' : ''}>
                      <button
                        className="drill-head"
                        onClick={() => setOpenDrill(open ? null : x.id)}
                        aria-expanded={open}
                      >
                        <span className="dname">{x.name}</span>
                        <span className="tags">
                          {x.equipment && <em>{t(`equipment.${x.equipment}`, undefined, x.equipment)}</em>}
                          {x.level && <em>{t(`level.${x.level}`, undefined, x.level)}</em>}
                        </span>
                      </button>
                      {open && (
                        <div className="drill-body">
                          {/* The muscles it trains, shown on the model above:
                              primary lit, secondary dimmed. */}
                          <div className="works">
                            {[...x.primary, ...x.secondary].map((k) => {
                              const z = map.zones.find((v) => v.key === k);
                              if (!z) return null;
                              const isPrimary = x.primary.includes(k);
                              return (
                                <span key={k} className={`work ${isPrimary ? 'primary' : ''}`}>
                                  <span className="dot" style={{ background: zoneColor(z) }} />
                                  {zoneName(z)}
                                </span>
                              );
                            })}
                          </div>
                          {x.instructions.length > 0 && (
                            <ol className="steps">
                              {x.instructions.map((s, i) => <li key={i}>{s}</li>)}
                            </ol>
                          )}
                          {x.videoId ? (
                            <button className="watch" onClick={() => setVideo(x)}>
                              ▶ {t('viewer.watch')}
                            </button>
                          ) : (
                            <a className="watch" href={x.youtube} target="_blank" rel="noreferrer noopener">
                              {t('viewer.searchYouTube')}
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
