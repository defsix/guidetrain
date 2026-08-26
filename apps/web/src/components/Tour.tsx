import { useEffect, useLayoutEffect, useState } from "react";

/** One stop: a real element already on the page, and what to say about it. */
export type TourStep = {
  /** Re-queried live on every step change — the app renders the element, not this component. */
  selector: string;
  body: string;
};

type Props = {
  steps: TourStep[];
  stepIndex: number;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
  skipLabel: string;
  nextLabel: string;
  finishLabel: string;
  counterLabel: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;
const TOOLTIP_WIDTH = 230;
// A rough, fixed estimate rather than measuring the real rendered tooltip —
// its width is fixed and its copy is short and translated into a narrow
// band of lengths, so the actual height varies only a little, and using an
// estimate here means placement can be computed in the same pass as the
// target's own rect instead of needing a second render once the tooltip's
// real size is known.
const TOOLTIP_EST_HEIGHT = 165;
const VIEWPORT_MARGIN = 12;

function measure(selector: string): Rect | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/**
 * The spotlight overlay itself — dims everything, cuts a lit hole over one
 * real element per step, and blocks interaction with the rest of the app
 * underneath rather than letting a tap fall through to it. Look, don't
 * touch: advancing is always the tooltip's own Next/Skip/Got it, never a
 * side effect of tapping the spotlighted element, so the tour never has to
 * guess whether a real interaction happened the way it expected.
 *
 * Knows nothing about GuideTrain's own panels — the caller (`BodyExplorer.tsx`)
 * owns which panel is open for each step and hands this component only a
 * selector and a sentence per stop.
 */
export default function Tour({
  steps, stepIndex, onNext, onSkip, onFinish,
  skipLabel, nextLabel, finishLabel, counterLabel,
}: Props) {
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // A step transition can open a panel that's still animating in — measuring
  // immediately would spotlight where the target will end up, not where it
  // actually is yet, so this waits a beat for things to settle first. If the
  // element still isn't there after that (a selector that stopped matching,
  // say, after some future UI change), skip forward instead of leaving the
  // tour stuck pointing at nothing.
  useLayoutEffect(() => {
    setRect(null);
    if (!step) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      const r = measure(step.selector);
      if (r) setRect(r);
      else if (isLast) onFinish();
      else onNext();
    }, 260);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [step, stepIndex]);

  useEffect(() => {
    if (!step) return;
    const reposition = () => {
      const r = measure(step.selector);
      if (r) setRect(r);
    };
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  if (!step || !rect) return null;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, viewportW - TOOLTIP_WIDTH - VIEWPORT_MARGIN));
  // Prefers hugging the target's edge — below it, or above if there's no
  // room below — but a target that fills most of the viewport (the 3D
  // model's own canvas, on the tour's first step) leaves neither edge with
  // real room, so this falls back to anchoring near the bottom of the
  // screen instead of hugging an edge that isn't actually there. Clamped
  // either way: the tooltip is never allowed off-screen, whatever the
  // target's size or position.
  let top: number;
  if (rect.top + rect.height + TOOLTIP_EST_HEIGHT + 12 + VIEWPORT_MARGIN < viewportH) {
    top = rect.top + rect.height + 12;
  } else if (rect.top - TOOLTIP_EST_HEIGHT - 12 > VIEWPORT_MARGIN) {
    top = rect.top - 12 - TOOLTIP_EST_HEIGHT;
  } else {
    top = viewportH - TOOLTIP_EST_HEIGHT - VIEWPORT_MARGIN;
  }
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportH - TOOLTIP_EST_HEIGHT - VIEWPORT_MARGIN));

  return (
    <>
      <div className="tour-backdrop" aria-hidden="true" />
      <div
        className="tour-veil"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />
      <div
        className="tour-tooltip"
        role="dialog"
        aria-modal="true"
        style={{ top, left }}
      >
        <p className="tour-count">{counterLabel}</p>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots">
          {steps.map((_, i) => (
            <span key={i} className={i === stepIndex ? "on" : ""} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onSkip}>{skipLabel}</button>
          <button className="tour-next" onClick={isLast ? onFinish : onNext}>
            {isLast ? finishLabel : nextLabel}
          </button>
        </div>
      </div>
    </>
  );
}
