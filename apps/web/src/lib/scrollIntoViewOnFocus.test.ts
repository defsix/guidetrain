import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollIntoViewOnFocus } from "./scrollIntoViewOnFocus";

/**
 * No jsdom in this project — these stub just enough of `window`,
 * `document.documentElement` (for the `--keyboard-height` custom property)
 * and an element (its rect, its `style`, and `scrollIntoView`) for the
 * function's own logic to run and be asserted on with fake timers, without
 * pulling in a full DOM.
 */
function fakeElement(rect: { top: number; bottom: number }) {
  return {
    getBoundingClientRect: () => rect,
    scrollIntoView: vi.fn(),
    style: {} as Record<string, string>,
  };
}

function focusEvent(el: ReturnType<typeof fakeElement>) {
  return { currentTarget: el } as unknown as React.FocusEvent<HTMLElement>;
}

function stubEnv(windowExtra: Record<string, unknown>, keyboardHeightPx: number) {
  vi.stubGlobal("window", { innerHeight: 800, ...windowExtra });
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (prop: string) => (prop === "--keyboard-height" ? `${keyboardHeightPx}px` : ""),
  }));
}

describe("scrollIntoViewOnFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does nothing if the field is already fully visible", () => {
    stubEnv({}, 0);
    const el = fakeElement({ top: 100, bottom: 200 });
    scrollIntoViewOnFocus(focusEvent(el));
    vi.advanceTimersByTime(2000);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls a field the --keyboard-height zone covers, even though the viewport itself never shrank", () => {
    // The real bug: on the Android WebView, window.innerHeight/
    // visualViewport.height don't change when the keyboard opens. This
    // stays at the full 800 the whole time — --keyboard-height (measured
    // natively, injected by MainActivity.kt) is the only thing that moves.
    stubEnv({}, 400);
    const el = fakeElement({ top: 500, bottom: 600 });
    scrollIntoViewOnFocus(focusEvent(el));
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("sets scroll-margin-bottom to the keyboard height plus a margin, then restores it", () => {
    stubEnv({}, 400);
    const el = fakeElement({ top: 500, bottom: 600 });
    let marginDuringCall = "";
    el.scrollIntoView = vi.fn(() => {
      marginDuringCall = el.style.scrollMarginBottom;
    });
    el.style.scrollMarginBottom = "original";
    scrollIntoViewOnFocus(focusEvent(el));
    expect(marginDuringCall).toBe("416px");
    expect(el.style.scrollMarginBottom).toBe("original");
  });

  it("still uses visualViewport/innerHeight when --keyboard-height is 0 (iOS, desktop, the plain website)", () => {
    stubEnv({ visualViewport: { height: 400 } }, 0);
    const el = fakeElement({ top: 350, bottom: 450 });
    scrollIntoViewOnFocus(focusEvent(el));
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("keeps re-checking and scrolls once the keyboard height changes mid-animation", () => {
    vi.stubGlobal("window", { innerHeight: 800 });
    vi.stubGlobal("document", { documentElement: {} });
    let kb = 0;
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: () => `${kb}px`,
    }));
    const el = fakeElement({ top: 500, bottom: 600 });
    scrollIntoViewOnFocus(focusEvent(el));
    expect(el.scrollIntoView).not.toHaveBeenCalled();

    kb = 400;
    vi.advanceTimersByTime(1000);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("gives up after the watch window instead of polling forever", () => {
    stubEnv({}, 400);
    const el = fakeElement({ top: 500, bottom: 600 });
    scrollIntoViewOnFocus(focusEvent(el));
    const callsSoFar = el.scrollIntoView.mock.calls.length;

    vi.advanceTimersByTime(5000);
    const totalCalls = el.scrollIntoView.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(callsSoFar);

    // No more scheduled checks left once the watch window has elapsed —
    // advancing further shouldn't add any more calls.
    vi.advanceTimersByTime(5000);
    expect(el.scrollIntoView.mock.calls.length).toBe(totalCalls);
  });
});
