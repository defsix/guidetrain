import React, { useState, useCallback, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import AnatomyModel from './AnatomyModel';
import EnvironmentBoundary from './EnvironmentBoundary';
import defaultMap from './muscle-map.json';
import exerciseData from './exercises.json';
import { pairsFor, pairsForRegion } from './pairs';
import { injuryFor, isAvoided } from '../lib/injuries';
import { injuryTag, injuryNote } from '../lib/injuryMessage';
import { toCatalogueEntry, isCustomExerciseId } from '../state/useCustomExercises';
import { findDuplicateExerciseName } from '../lib/duplicateExercise';
import { EQUIPMENT_TAGS } from '../types';
import { scrollIntoViewOnFocus } from '../lib/scrollIntoViewOnFocus';
import VideoModal from './VideoModal';
import { useI18n } from '../i18n/I18nProvider';
import { useSwipeDismiss } from '../state/useSwipeDismiss';
import { useScrollExpandedIntoView } from '../state/useScrollExpandedIntoView';
import './anatomy.css';

/** Every equipment tag a custom exercise can be filed under — the same
 * ones `EquipmentPanel` asks about, plus the two the catalogue itself uses
 * that aren't a real purchase ("body only", "other"). */
const CUSTOM_EQUIPMENT = [...EQUIPMENT_TAGS, 'body only', 'other'];

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
function FrameToVisible({ cover, sideCover, controlsRef, children }) {
  const group = useRef();
  const { camera, gl, size: viewportSize } = useThree();
  const snap = useRef(true);
  const size = useRef(null);

  // Priority -2, ahead of drei's OrbitControls (-1): the orbit target has to
  // be this frame's position before OrbitControls reads it, not last frame's.
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

    // The body moves to stay clear of the panels, but the orbit pivot was
    // left behind at the world origin — every drag rotated the camera around
    // empty space next to the model instead of around the model itself,
    // which reads as the whole body swinging off to one side rather than
    // spinning in place. The pivot has to move with it, every frame.
    const controls = controlsRef?.current;
    if (controls) controls.target.set(g.position.x, g.position.y, 0);

    // Syncing the orbit target above is necessary for dragging to rotate
    // around the body rather than empty space — but it comes with a side
    // effect that undoes the whole point of this component: an orbit camera
    // always renders its own target dead-centre on screen, no matter where
    // that target sits in world space. So the instant the target follows
    // the body off to one side, the camera swings straight back to keep it
    // centred, and the body ends up exactly where it started — in the
    // middle of the full canvas, not the middle of the band that's actually
    // free of panels, which is exactly the clipping this component exists
    // to prevent.
    //
    // setViewOffset renders an off-axis sub-window of the projection
    // instead — a real 2D shift of the image, independent of where the
    // camera is aimed — so the body can be centred in the visible band on
    // screen while the orbit target stays truthfully on the body, for
    // correct drag behaviour. Units are device pixels of the actual render
    // target, not CSS pixels, hence the pixelRatio multiply.
    const dpr = gl.getPixelRatio();
    const w = Math.round(viewportSize.width * dpr);
    const h = Math.round(viewportSize.height * dpr);
    if (w > 0 && h > 0) {
      const pxPerUnitX = w / viewW;
      const pxPerUnitY = h / viewH;
      camera.setViewOffset(w, h, -g.position.x * pxPerUnitX, g.position.y * pxPerUnitY, w, h);
    }
  }, -2);

  return <group ref={group}>{children}</group>;
}

/**
 * The name + equipment form for a custom exercise, shared between creating
 * one (appended below a muscle's list) and editing one already there (open
 * inside its own drill body) — the two ask for exactly the same two fields,
 * just with different starting values and a different verb on the submit
 * button.
 */
function ExerciseForm({ t, name, equipment, onChangeName, onChangeEquipment, onSubmit, onCancel, submitLabel, autoFocus, error }) {
  return (
    <form
      className="add-exercise-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit();
      }}
    >
      <input
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        onFocus={scrollIntoViewOnFocus}
        placeholder={t('viewer.addExercise.placeholder')}
        aria-label={t('viewer.addExercise.placeholder')}
        maxLength={60}
        autoFocus={autoFocus}
      />
      {error && <p className="add-exercise-error">{error}</p>}
      <div className="eq-chip-row">
        {CUSTOM_EQUIPMENT.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`eq-chip ${equipment === tag ? 'eq-chip-selected' : ''}`}
            onClick={() => onChangeEquipment(tag)}
          >
            {t(`equipment.${tag}`)}
          </button>
        ))}
      </div>
      <div className="add-exercise-actions">
        <button type="submit" disabled={!name.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="add-exercise-cancel" onClick={onCancel}>
          {t('viewer.addExercise.cancel')}
        </button>
      </div>
    </form>
  );
}

/**
 * The viewer's public surface, written out because TypeScript infers a JS
 * component's props from its defaults — `savedIds = null` would otherwise mean
 * the prop's type *is* null, and passing a real array would be the error.
 *
 * @param {{
 *   modelUrl?: string,
 *   map?: any,
 *   theme?: string,
 *   onTrain?: ((detail: {id: string, name: string, region: string, label: string}) => void) | null,
 *   onSelect?: ((zone: any) => void) | null,
 *   savedIds?: string[] | null,
 *   onToggleSave?: ((id: string) => void) | null,
 *   equipmentAvailable?: string[] | null,
 *   injuries?: Record<string, {mode: 'avoid'|'warn', setAt: number}> | null,
 *   toolbarExtra?: import('react').ReactNode | null,
 *   focusMuscleId?: string | null,
 *   customExercises?: import('../state/useCustomExercises').CustomExercise[] | null,
 *   onAddCustomExercise?: ((primary: string, name: string, equipment: string) => void) | null,
 *   onEditCustomExercise?: ((id: string, name: string, equipment: string) => void) | null,
 *   onRemoveCustomExercise?: ((id: string) => void) | null,
 * }} props
 */
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
  // The saved workout belongs to the app, not to a drop-in viewer: this
  // component knows how to offer an exercise and nothing about where it goes.
  // Pass both to get the control, neither to leave it out entirely.
  savedIds = null,
  onToggleSave = null,
  // What's actually available right now — see EquipmentPanel. Undefined or
  // empty means no preference stated, and every list here stays in exactly
  // the order it always rendered in.
  equipmentAvailable = null,
  // Muscles marked injured on the Progress page — see lib/injuries.ts.
  // Undefined or empty behaves exactly like no injuries marked.
  injuries = null,
  // A host button to show beside Muscle Groups in the phone-only toolbar —
  // the one place on a narrow screen wide enough to hold a second pill
  // without the row overflowing. Not the viewer's own concern otherwise,
  // same reasoning as savedIds/onToggleSave above.
  toolbarExtra = null,
  // Opens a muscle's readout the same way tapping it on the model would —
  // for a host that needs to point at a real exercise row without asking
  // the reader to find and tap the right spot themselves first. The
  // spotlight tour is the one caller today: see Tour.tsx. A zone id, not an
  // object, since the caller only knows which muscle it wants, not the
  // zone's full shape.
  focusMuscleId = null,
  // Exercises the reader typed in themselves — see useCustomExercises.ts.
  // Filtered to the selected muscle and appended below the catalogue's own
  // list for it, same reasoning as savedIds/onToggleSave above: the viewer
  // knows how to offer the picker, the host owns where the data lives.
  customExercises = null,
  onAddCustomExercise = null,
  onEditCustomExercise = null,
  onRemoveCustomExercise = null,
}) {
  const scene = SCENE[theme] || SCENE.dark;
  const { t, localizeExercise } = useI18n();
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [region, setRegion] = useState('all');
  const [openDrill, setOpenDrill] = useState(null);
  const registerDrillBody = useScrollExpandedIntoView(openDrill);
  const [video, setVideo] = useState(null);
  // The "add your own exercise" form, at the bottom of the list — closed by
  // default so a long catalogue list doesn't grow an always-open form under
  // it, and reset whenever the selected muscle changes so it can't be left
  // open pointed at a muscle no longer on screen.
  const [addingExercise, setAddingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseEquipment, setNewExerciseEquipment] = useState('body only');
  // Set only after a submit attempt finds a name too close to an existing
  // one — see findDuplicateExerciseName. Cleared on every keystroke so it
  // never sits there stale once the reader has changed the name.
  const [addError, setAddError] = useState(null);
  // Which custom exercise's own drill body is showing the edit form instead
  // of its usual (empty) reference section — at most one at a time, cleared
  // whenever a row opens or closes so reopening one never shows a stale
  // in-progress edit.
  const [editingCustomId, setEditingCustomId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEquipment, setEditEquipment] = useState('body only');
  const [editError, setEditError] = useState(null);
  // Which suggested partner is expanded. A pair used to open its video on the
  // first tap, which answered "show me" before anyone had asked "what is it".
  const [openPair, setOpenPair] = useState(null);
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
  const toolbarRef = useRef(null);
  const [cover, setCover] = useState(0);
  const [sideCover, setSideCover] = useState(0);
  // Shared with FrameToVisible so the orbit pivot can be kept over the model
  // as it steps aside for the panels — see the comment there.
  const controlsRef = useRef(null);

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
      if (root) {
        // The docked "Muscle Groups" panel used to assume a fixed, single-
        // line toolbar height (a plain top: 58px in the CSS). Once a host
        // app starts passing more than one or two pills via toolbarExtra,
        // long labels — worse still in some translations — wrap onto a
        // second line, and that guess falls short: the panel then opens
        // overlapping the wrapped pills instead of below them. Measuring
        // the real toolbar and exposing it as a custom property lets the
        // panel's own offset (see anatomy.css) stay correct regardless of
        // how many pills there are or how tall they end up being.
        const toolbar = toolbarRef.current;
        root.style.setProperty('--toolbar-h', toolbar ? `${toolbar.getBoundingClientRect().height}px` : '0px');
      }

      if (!root || !sheet || !overlaps) return setCover(0);
      const rootH = root.getBoundingClientRect().height;
      const sheetH = sheet.getBoundingClientRect().height;
      if (!rootH) return setCover(0);
      // A little breathing room above the sheet, and a ceiling — above the
      // sheet's own 66% CSS cap (see anatomy.css) — so the body never
      // shrinks to nothing if the sheet grows unexpectedly.
      setCover(Math.min(0.72, (sheetH + 12) / rootH));
    };
    measure();

    const ro = new ResizeObserver(measure);
    if (readoutRef.current) ro.observe(readoutRef.current);
    if (regionsRef.current) ro.observe(regionsRef.current);
    if (rootRef.current) ro.observe(rootRef.current);
    if (toolbarRef.current) ro.observe(toolbarRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [selected, openDrill, panel]);

  // Available equipment as a set once per render rather than re-scanning an
  // array on every comparison — pairsFor/pairsForRegion below take the same
  // set, so it's shared rather than rebuilt for each.
  const equipmentSet = useMemo(
    () => (equipmentAvailable && equipmentAvailable.length ? new Set(equipmentAvailable) : null),
    [equipmentAvailable],
  );
  // Bodyweight work needs nothing, so it counts as available regardless of
  // what was picked; everything else needs an actual match.
  const hasEquipment = useCallback(
    (x) => x.equipment === 'body only' || (equipmentSet ? equipmentSet.has(x.equipment) : true),
    [equipmentSet],
  );

  // Exercises for the selected muscle, and the one whose detail is open — that
  // one is painted onto the model so you can see what the movement trains.
  //
  // Stable rather than a plain filter: nothing here is hidden, only
  // reordered, because "prioritise" is not "hide" — a machine-only reader
  // filtered here would never *see* the barbell row they could still ask a
  // gym neighbour to spot, and the whole point of the equipment tags on
  // every row is that the reader keeps that information either way.
  // Every catalogue exercise's own localized name, once — for catching a
  // custom exercise that duplicates one the app already has, not just one
  // the reader already added themselves. Every muscle in exerciseData is
  // scanned rather than just the selected one: a name typed under the
  // wrong muscle should still be caught.
  const catalogNames = useMemo(() => {
    const seen = new Map();
    for (const list of Object.values(exerciseData.muscles)) {
      for (const x of list) if (!seen.has(x.id)) seen.set(x.id, x);
    }
    return [...seen.values()].map((x) => localizeExercise(x).name);
  }, [localizeExercise]);

  const drills = useMemo(() => {
    const list = (selected ? exerciseData.muscles[selected.key] || [] : []).map(localizeExercise);
    const ranked = equipmentSet
      ? list
          .map((x, i) => [x, i])
          .sort(([a, i], [b, j]) => (hasEquipment(b) - hasEquipment(a)) || i - j)
          .map(([x]) => x)
      : list;
    // Always at the true bottom, after the equipment reorder above — a
    // custom exercise has no catalogue data to rank it by, and its place in
    // the list is "the one you just added", not a claim about how good a
    // match it is.
    const mine = selected
      ? (customExercises || []).filter((x) => x.primary === selected.key).map(toCatalogueEntry)
      : [];
    return mine.length ? [...ranked, ...mine] : ranked;
  }, [selected, localizeExercise, equipmentSet, hasEquipment, customExercises]);
  const saved = useMemo(() => new Set(savedIds || []), [savedIds]);

  const shownDrill = useMemo(
    () => drills.find((x) => x.id === openDrill) || null,
    [drills, openDrill],
  );

  // Exercises to superset with the open one. Localised here rather than in
  // pairs.js, because the rule is about muscles and regions and stays the same
  // in every language; only the names shown change.
  const partners = useMemo(() => {
    // A wider pool than the 3 actually shown, so an "avoid" injury filtering
    // some out doesn't just shrink the list below what pairsFor/pairsForRegion
    // would otherwise have offered.
    const found = shownDrill
      ? pairsFor(shownDrill, 8, equipmentSet)
      : pairsForRegion(selected?.region, 8, equipmentSet);
    return found
      .filter((x) => !isAvoided(x, injuries || {}))
      .slice(0, 3)
      .map(localizeExercise);
  }, [shownDrill, selected, localizeExercise, equipmentSet, injuries]);

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
    setOpenPair(null);
    setAddingExercise(false);
    setNewExerciseName('');
    setAddError(null);
    setEditingCustomId(null);
    setEditError(null);
    // On a phone the picker sits over the model, so leaving it open would hide
    // the very muscle that was just chosen.
    if (z) setPanel(null);
    onSelect && onSelect(z);
  }, [onSelect, region]);

  const closeReadout = useCallback(() => handleSelect(null), [handleSelect]);
  const readoutSwipe = useSwipeDismiss(closeReadout);

  // Fires once per *change* of which muscle the tour wants focused, not on
  // every render handleSelect's own closures happen to change (e.g. the
  // reader nudging the region filter mid-step) — those would otherwise
  // re-fire this and fight them for the selection.
  useEffect(() => {
    if (!focusMuscleId) return;
    const z = selectable.find((m) => m.id === focusMuscleId);
    if (z) handleSelect(z);
  }, [focusMuscleId]);

  // Train This deals from a shuffled bag, not a die roll: every exercise for
  // this muscle comes up once before any comes up twice. Rolling a die repeats
  // — eight presses on a four-exercise muscle returned three distinct videos —
  // and a button that hands you the same thing twice running reads as broken
  // rather than as chance. Ids rather than objects, so a language change
  // mid-bag doesn't leave stale translations queued up.
  const bag = useRef({ key: null, queue: [], last: null });

  // The injury marked on the muscle currently under the readout, if any —
  // every exercise for this muscle has it as their primary mover (see
  // muscleRegions.ts's MUSCLES export, drawn from the same catalogue), so an
  // "avoid" here means every one of them is off-limits, not just some.
  const selectedInjury = useMemo(
    () => (selected && injuries ? injuries[selected.key ?? selected.id] : null),
    [selected, injuries],
  );

  const train = () => {
    if (!selected || selectedInjury?.mode === 'avoid') return;
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
          <FrameToVisible cover={cover} sideCover={sideCover} controlsRef={controlsRef}>
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
          ref={controlsRef}
          enablePan={false}
          minDistance={1.6}
          maxDistance={7}
          // Always turning, so the back of the model is reachable without
          // anyone having to discover that it can be dragged. Held still for a
          // reader who has asked for less motion — a body that never stops
          // moving is exactly what that setting is about.
          autoRotate={!stillness}
          autoRotateSpeed={0.8}
          // No static target here — FrameToVisible drives it every frame,
          // since the model itself moves to stay clear of the panels and the
          // orbit pivot has to move with it. See the comment there.
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
      <div className="anatomy-toolbar" ref={toolbarRef}>
        {toolbarExtra}
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
                  <span className="dot" />
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
          <div
            className={`head ${readoutSwipe.dragging ? 'dragging' : ''}`}
            {...readoutSwipe.handleProps}
          >
            <span className="sheet-handle" aria-hidden="true" />
            <div className="body">
              <div className="mname">{zoneName(selected)}</div>
              <div className="mmeta">{regionName(selected.region)}</div>
              <div className="mdesc">{zoneDesc(selected)}</div>
              {selectedInjury && (
                <p className="minjury">{injuryNote(t, selectedInjury.mode, zoneName(selected))}</p>
              )}
            </div>
            <button
              className="train-btn"
              onClick={train}
              disabled={selectedInjury?.mode === 'avoid'}
              title={selectedInjury?.mode === 'avoid' ? injuryNote(t, 'avoid', zoneName(selected)) : undefined}
            >
              {t('viewer.trainThis')}
            </button>
          </div>

          {/* What to do in the rest between sets, before the exercise list
              rather than buried inside one of its entries. Answers the muscle
              until an exercise is open, then that exercise — which is the more
              precise question, since it knows the secondary muscles too. */}
          {partners.length > 0 && (
            <div className="pairs">
              <h4>{t('viewer.pairTitle')}</h4>
              <p className="pair-why">{t('viewer.pairWhy')}</p>
              {partners.map((p) => {
                const shown = openPair === p.id;
                // "avoid" partners never reach this list — see the partners
                // memo above — so the only injury left to flag here is "warn".
                const injury = injuryFor(p, injuries || {});
                return (
                  <div key={p.id} className={`pair-item ${shown ? 'open' : ''}`}>
                    <button
                      className="pair"
                      onClick={() => setOpenPair(shown ? null : p.id)}
                      aria-expanded={shown}
                    >
                      <span className="pname">{p.name}</span>
                      <span className="tags">
                        <em>{t(`equipment.${p.equipment}`, undefined, p.equipment)}</em>
                        {injury && <em className="injury-flag">{injuryTag(t, injury.mode)}</em>}
                      </span>
                    </button>
                    {/* How to do it first, then the demonstration underneath —
                        reading takes a moment between sets, a video takes the
                        whole rest. */}
                    {shown && (
                      <div className="pair-body">
                        {p.instructions.length > 0 && (
                          <ol className="steps">
                            {p.instructions.map((line, i) => <li key={i}>{line}</li>)}
                          </ol>
                        )}
                        {p.videoId ? (
                          <button className="watch" onClick={() => setVideo(p)}>
                            ▶ {t('viewer.watch')}
                          </button>
                        ) : (
                          <a className="watch" href={p.youtube} target="_blank" rel="noreferrer noopener">
                            {t('viewer.searchYouTube')}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {drills.length > 0 && (
            <div className="drills">
              <h3>{t('viewer.exercises', { count: drills.length })}</h3>
              <ul>
                {drills.map((x) => {
                  const open = openDrill === x.id;
                  const custom = isCustomExerciseId(x.id);
                  const editing = custom && editingCustomId === x.id;
                  return (
                    <li key={x.id} className={open ? 'open' : ''}>
                      <div className="drill-row">
                      <button
                        className="drill-head"
                        onClick={() => {
                          setOpenDrill(open ? null : x.id);
                          setEditingCustomId(null);
                          setEditError(null);
                        }}
                        aria-expanded={open}
                      >
                        <span className="dname">{x.name}</span>
                        <span className="tags">
                          {x.equipment && <em>{t(`equipment.${x.equipment}`, undefined, x.equipment)}</em>}
                          {x.level && <em>{t(`level.${x.level}`, undefined, x.level)}</em>}
                        </span>
                      </button>
                      {/* Outside the expander button, because a button inside a
                          button is not markup a browser or a screen reader can
                          make sense of. */}
                      {onToggleSave && (
                        <button
                          className={`save ${saved.has(x.id) ? 'on' : ''}`}
                          onClick={() => onToggleSave(x.id)}
                          aria-pressed={saved.has(x.id)}
                          aria-label={`${saved.has(x.id) ? t('workout.remove') : t('workout.add')} — ${x.name}`}
                          title={saved.has(x.id) ? t('workout.remove') : t('workout.add')}
                        >
                          {saved.has(x.id) ? '✓' : '+'}
                        </button>
                      )}
                      </div>
                      {open && (
                        <div className="drill-body" ref={registerDrillBody(x.id)}>
                          {/* The muscles it trains, shown on the model above:
                              primary lit, secondary dimmed. */}
                          <div className="works">
                            {[...x.primary, ...x.secondary].map((k) => {
                              const z = map.zones.find((v) => v.key === k);
                              if (!z) return null;
                              const isPrimary = x.primary.includes(k);
                              return (
                                <span key={k} className={`work ${isPrimary ? 'primary' : ''}`}>
                                  <span className="dot" />
                                  {zoneName(z)}
                                </span>
                              );
                            })}
                          </div>
                          {editing ? (
                            <ExerciseForm
                              t={t}
                              name={editName}
                              equipment={editEquipment}
                              onChangeName={(v) => { setEditName(v); setEditError(null); }}
                              onChangeEquipment={setEditEquipment}
                              onSubmit={() => {
                                // Every other custom exercise, and the whole
                                // catalogue — but not this one's own current
                                // name, or saving with no real change to the
                                // name would flag itself as its own duplicate.
                                const others = (customExercises || [])
                                  .filter((c) => c.id !== x.id)
                                  .map((c) => c.name);
                                const dup = findDuplicateExerciseName(editName, [...catalogNames, ...others]);
                                if (dup) {
                                  setEditError(t('viewer.addExercise.duplicate', { name: dup }));
                                  return;
                                }
                                onEditCustomExercise(x.id, editName, editEquipment);
                                setEditingCustomId(null);
                              }}
                              onCancel={() => { setEditingCustomId(null); setEditError(null); }}
                              submitLabel={t('stats.save')}
                              autoFocus={false}
                              error={editError}
                            />
                          ) : (
                            <>
                              {/* Actions and planning first, reference text after.
                                  The instructions run to eight long steps, and
                                  anything below them was found only by someone who
                                  already knew to scroll — which is no way to offer
                                  a suggestion. */}
                              {x.videoId ? (
                                <button className="watch" onClick={() => setVideo(x)}>
                                  ▶ {t('viewer.watch')}
                                </button>
                              ) : x.youtube ? (
                                <a className="watch" href={x.youtube} target="_blank" rel="noreferrer noopener">
                                  {t('viewer.searchYouTube')}
                                </a>
                              ) : null}

                              {x.equipment === 'barbell' && (
                                <p className="loading-note">{t('load.barTotalNote')}</p>
                              )}
                              {x.equipment === 'dumbbell' && (
                                <p className="loading-note">{t('load.perHandNote')}</p>
                              )}
                              {x.instructions.length > 0 && (
                                <ol className="steps">
                                  {x.instructions.map((s, i) => <li key={i}>{s}</li>)}
                                </ol>
                              )}
                              {/* A custom exercise has none of the above to show
                                  — no video, no instructions — so this is the
                                  first thing in its body, not a late addition
                                  competing with real reference material. */}
                              {custom && onEditCustomExercise && onRemoveCustomExercise && (
                                <div className="add-exercise-actions">
                                  <button
                                    type="button"
                                    className="watch"
                                    onClick={() => {
                                      setEditName(x.name);
                                      setEditEquipment(x.equipment || 'body only');
                                      setEditError(null);
                                      setEditingCustomId(x.id);
                                    }}
                                  >
                                    {t('viewer.addExercise.edit')}
                                  </button>
                                  <button
                                    type="button"
                                    className="custom-exercise-delete"
                                    onClick={() => {
                                      onRemoveCustomExercise(x.id);
                                      setOpenDrill(null);
                                    }}
                                  >
                                    {t('viewer.addExercise.delete')}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {onAddCustomExercise && (
                addingExercise ? (
                  <ExerciseForm
                    t={t}
                    name={newExerciseName}
                    equipment={newExerciseEquipment}
                    onChangeName={(v) => { setNewExerciseName(v); setAddError(null); }}
                    onChangeEquipment={setNewExerciseEquipment}
                    onSubmit={() => {
                      const existing = (customExercises || []).map((c) => c.name);
                      const dup = findDuplicateExerciseName(newExerciseName, [...catalogNames, ...existing]);
                      if (dup) {
                        setAddError(t('viewer.addExercise.duplicate', { name: dup }));
                        return;
                      }
                      onAddCustomExercise(selected.key, newExerciseName, newExerciseEquipment);
                      setNewExerciseName('');
                      setAddingExercise(false);
                    }}
                    onCancel={() => { setAddingExercise(false); setAddError(null); }}
                    submitLabel={t('viewer.addExercise.submit')}
                    autoFocus
                    error={addError}
                  />
                ) : (
                  <button className="add-exercise-open" onClick={() => { setAddingExercise(true); setAddError(null); }}>
                    + {t('viewer.addExercise.button')}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
