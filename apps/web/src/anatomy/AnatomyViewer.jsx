import React, { useState, useCallback, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import AnatomyModel from './AnatomyModel';
import EnvironmentBoundary from './EnvironmentBoundary';
import defaultMap from './muscle-map.json';
import { zoneColor } from './zoneMapping';
import exerciseData from './exercises.json';
import { pairsFor } from './pairs';
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

/**
 * Keeps the body inside the part of the canvas nothing is covering.
 *
 * On a phone the exercise sheet is a bottom sheet over the canvas, so half the
 * model ends up behind it. Rather than shrink the sheet, the body moves: it
 * lifts by half of what is covered and scales down to fit the band that is
 * left. Moving the model instead of the camera means orbiting and zooming
 * still belong entirely to the reader — nothing fights their input.
 *
 * `cover` is the fraction of canvas height the sheet occupies, measured rather
 * than assumed, because the sheet is shorter for a muscle with few exercises.
 */
function FrameToVisible({ cover, sideCover, children }) {
  const group = useRef();
  const { camera } = useThree();
  const snap = useRef(true);
  const size = useRef(null);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    // The body's own size in world units, read once from the loaded geometry
    // rather than assumed. What fraction of the frame it fills depends on the
    // aspect ratio — the same model is a quarter of a desktop's width and four
    // fifths of a phone's — so a constant would only ever suit one of them.
    if (!size.current && g.children.length) {
      const box = new THREE.Box3().setFromObject(g);
      const v = new THREE.Vector3();
      box.getSize(v);
      if (v.x > 0 && v.y > 0) size.current = { w: v.x / g.scale.x, h: v.y / g.scale.y };
    }

    // World size the camera sees at the model's distance. Taken live, so a
    // reader who has zoomed in still gets a correct lift.
    const dist = camera.position.length() || 3.4;
    const viewH = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
    const viewW = viewH * (camera.aspect || 1);

    // The muscle picker is docked to the right, so the body steps left by half
    // of what it takes — the same idea as the lift, along the other axis.
    const wantX = -(sideCover / 2) * viewW;
    // Centre of the free band sits cover/2 above the centre of the canvas.
    const wantY = (cover / 2) * viewH;

    // Fit whichever axis is tighter. PAD keeps a margin all round: fitting
    // exactly left 1px of headroom above the head, which any longer sheet
    // would have turned into a clipped skull.
    const PAD = 0.025;
    const availH = (1 - cover - 2 * PAD) * viewH;
    const availW = (1 - sideCover - 2 * PAD) * viewW;
    const m = size.current;
    const wantS = m
      ? Math.min(1, Math.max(0.4, Math.min(availH / m.h, availW / m.w)))
      : 1;

    // First frame lands where it belongs rather than sliding in from nowhere;
    // so does every frame for a reader who has asked for less motion.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const k = snap.current || still ? 1 : 1 - Math.pow(0.002, delta);
    g.position.x += (wantX - g.position.x) * k;
    g.position.y += (wantY - g.position.y) * k;
    g.scale.setScalar(g.scale.x + (wantS - g.scale.x) * k);
    snap.current = false;
  });

  return <group ref={group}>{children}</group>;
}

export default function AnatomyViewer({
  modelUrl = '/models/anatomy_mobile.glb',
  map = defaultMap,
  theme = 'dark',
  // Optional hooks for a host app that wants to record what was picked. The
  // viewer is fully usable without them, and the defaults are what say so —
  // TypeScript infers this component's props from the source, and a bare
  // `onTrain,` reads as required.
  onTrain = null,
  onSelect = null,
}) {
  const scene = SCENE[theme] || SCENE.dark;
  const { t, localizeExercise } = useI18n();
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [region, setRegion] = useState('all');
  const [openDrill, setOpenDrill] = useState(null);
  const [video, setVideo] = useState(null);
  // Which floating panel is open on a phone. Both are always on screen at
  // desktop widths; below 720px they would cover the model, so they start
  // closed and open one at a time from the toolbar.
  const [panel, setPanel] = useState('regions');
  // The model is 1.1 MB, so on a cold connection the canvas is empty for a
  // noticeable stretch. Say so rather than showing an empty stage.
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);

  // Whether the reader has asked the system for less motion. Watched rather
  // than read once, since it can be toggled while the page is open.
  const [stillness, setStillness] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = (e) => setStillness(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // How much of the canvas the exercise sheet is covering, 0 when it isn't.
  // Only the phone layout puts it over the body; on a wide screen it sits in a
  // corner the model never reaches.
  const rootRef = useRef(null);
  const readoutRef = useRef(null);
  const regionsRef = useRef(null);
  const [cover, setCover] = useState(0);
  const [sideCover, setSideCover] = useState(0);

  useEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      const sheet = readoutRef.current;
      const overlaps = window.matchMedia('(max-width: 720px)').matches;
      const list = regionsRef.current;
      const rootW = root ? root.getBoundingClientRect().width : 0;
      // The docked picker takes a strip off the right; the body steps aside
      // rather than hiding behind it.
      setSideCover(
        overlaps && list && rootW && getComputedStyle(list).display !== 'none'
          ? Math.min(0.5, (list.getBoundingClientRect().width + 12) / rootW)
          : 0,
      );
      if (!root || !sheet || !overlaps) return setCover(0);
      const rootH = root.getBoundingClientRect().height;
      const sheetH = sheet.getBoundingClientRect().height;
      if (!rootH) return setCover(0);
      // A little breathing room above the sheet, and a ceiling so the body
      // never shrinks to nothing if the sheet grows unexpectedly.
      setCover(Math.min(0.62, (sheetH + 12) / rootH));
    };
    measure();

    const ro = new ResizeObserver(measure);
    if (readoutRef.current) ro.observe(readoutRef.current);
    if (regionsRef.current) ro.observe(regionsRef.current);
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [selected, openDrill, panel]);

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

  // Exercises to superset with the open one. Localised here rather than in
  // pairs.js, because the rule is about muscles and regions and stays the same
  // in every language; only the names shown change.
  const partners = useMemo(
    () => pairsFor(shownDrill).map(localizeExercise),
    [shownDrill, localizeExercise],
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

  // Train This deals from a shuffled bag, not a die roll: every exercise for
  // this muscle comes up once before any comes up twice. Rolling a die repeats
  // — eight presses on a four-exercise muscle returned three distinct videos —
  // and a button that hands you the same thing twice running reads as broken
  // rather than as chance. Ids rather than objects, so a language change
  // mid-bag doesn't leave stale translations queued up.
  const bag = useRef({ key: null, queue: [], last: null });

  const train = () => {
    if (!selected) return;
    // Every exercise has a demonstration today, but ids rot and --revalidate
    // drops the bad ones, so this filter is what keeps the button from opening
    // an empty player.
    const playable = drills.filter((x) => x.videoId);
    if (playable.length) {
      const b = bag.current;
      if (b.key !== selected.id || !b.queue.length) {
        const ids = playable.map((x) => x.id);
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        // The seam between two bags is the one place a repeat can still land,
        // so a refill that starts on what just played steps aside one place.
        if (ids.length > 1 && b.key === selected.id && ids[0] === b.last) {
          [ids[0], ids[1]] = [ids[1], ids[0]];
        }
        b.key = selected.id;
        b.queue = ids;
      }
      const id = b.queue.shift();
      b.last = id;
      // Falls back if an id went away under us — the list is rebuilt whenever
      // the muscle or the language changes, and the bag outlives one of those.
      setVideo(playable.find((x) => x.id === id) || playable[0]);
    }
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
    <div className="anatomy-root" ref={rootRef}>
      <Canvas camera={{ position: [0, 0.2, 3.4], fov: 42 }} dpr={[1, 2]}>
        <color attach="background" args={[scene.bg]} />
        <fog attach="fog" args={scene.fog} />
        <ambientLight intensity={scene.ambient[1]} color={scene.ambient[0]} />
        <directionalLight position={[4, 6, 8]} intensity={scene.key[1]} color={scene.key[0]} />
        <directionalLight position={[-6, 3, -5]} intensity={scene.fill[1]} color={scene.fill[0]} />
        <Suspense fallback={null}>
          <FrameToVisible cover={cover} sideCover={sideCover}>
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
          </FrameToVisible>
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
          // Always turning, so the back of the model is reachable without
          // anyone having to discover that it can be dragged. Held still for a
          // reader who has asked for less motion — a body that never stops
          // moving is exactly what that setting is about.
          autoRotate={!stillness}
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
      <div id="anatomy-regions" ref={regionsRef} className={`anatomy-panel regions ${panel === 'regions' ? 'open' : ''}`}>
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

      {video && <VideoModal exercise={video} onClose={() => setVideo(null)} />}

      {/* Hover tooltip */}
      {hover && <div className="anatomy-hover">{zoneName(hover)}</div>}

      {/* Selection readout, with the exercises that train this muscle */}
      {selected && (
        <div className="anatomy-readout" ref={readoutRef}>
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

                          {/* What to do in the rest between sets. Nothing here
                              shares a region with the exercise above, so it
                              trains while the first movement recovers. */}
                          {partners.length > 0 && (
                            <div className="pairs">
                              <h4>{t('viewer.pairTitle')}</h4>
                              <p className="pair-why">{t('viewer.pairWhy')}</p>
                              {partners.map((p) => (
                                <button
                                  key={p.id}
                                  className="pair"
                                  onClick={() => setVideo(p)}
                                  disabled={!p.videoId}
                                  title={p.videoId ? t('viewer.watch') : undefined}
                                >
                                  <span className="pname">{p.name}</span>
                                  <span className="tags">
                                    <em>{t(`equipment.${p.equipment}`, undefined, p.equipment)}</em>
                                  </span>
                                </button>
                              ))}
                            </div>
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
