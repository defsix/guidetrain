import { useEffect, useState } from "react";

/**
 * TEMPORARY — remove once the Android keyboard-inset chain is confirmed
 * working, or once this has told us where it actually breaks.
 *
 * Five fixes in a row (adjustResize, WebView padding fed from
 * WindowInsets.Type.ime(), a --keyboard-height CSS property fed from that
 * same API, then the same property fed from getWindowVisibleDisplayFrame
 * instead) have each reportedly made no difference on a real device. Two
 * completely independent native measurement techniques failing identically
 * stops being explainable by "wrong technique" — something earlier or later
 * in the chain (the native measurement never running at all, the
 * evaluateJavascript call never landing, a WebView/Chromium-internal
 * keyboard quirk none of this has touched) is more likely, and guessing a
 * sixth native fix blind isn't a good use of another build-and-test cycle.
 *
 * This turns the next test into a direct measurement instead: a small,
 * always-visible readout of the three numbers every fix so far has reasoned
 * from — --keyboard-height (what the native side is supposed to be
 * feeding in), window.innerHeight and visualViewport.height (what the
 * earlier, abandoned fixes assumed would shrink on their own). Whatever
 * these show with the keyboard open says exactly which end of the chain to
 * look at next, rather than guessing again.
 */
export default function KeyboardDebugBadge() {
  const [line, setLine] = useState("");

  useEffect(() => {
    const tick = () => {
      const kb = getComputedStyle(document.documentElement)
        .getPropertyValue("--keyboard-height")
        .trim();
      const vv = window.visualViewport ? `${Math.round(window.visualViewport.height)}px` : "n/a";
      setLine(`kb=${kb || "(empty)"} inner=${window.innerHeight}px vv=${vv}`);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        zIndex: 999999,
        background: "rgba(0,0,0,0.8)",
        color: "#4ade80",
        fontFamily: "monospace",
        fontSize: 11,
        padding: "5px 9px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {line}
    </div>
  );
}
