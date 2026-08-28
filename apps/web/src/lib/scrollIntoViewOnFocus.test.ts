import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollIntoViewOnFocus } from "./scrollIntoViewOnFocus";

/**
 * No jsdom in this project — these stub just enough of `window` and an
 * element for the function's own logic (it only ever reads
 * `window.innerHeight`/`window.visualViewport.height`, and calls
 * `getBoundingClientRect()`/`scrollIntoView()` on the focused element) to
 * run and be asserted on with fake timers, without pulling in a full DOM.
 */
function fakeElement(rect: { top: number; bottom: number }) {
  return {
    getBoundingClientRect: () => rect,
    scrollIntoView: vi.fn(),
  };
}

function focusEvent(el: ReturnType<typeof fakeElement>) {
  return { currentTarget: el } as unknown as React.FocusEvent<HTMLElement>;
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
    vi.stubGlobal("window", { innerHeight: 800 });
    const el = fakeElement({ top: 100, bottom: 200 });
    scrollIntoViewOnFocus(focusEvent(el));
    vi.advanceTimersByTime(2000);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls a field the keyboard already covers, using visualViewport height over innerHeight", () => {
    vi.stubGlobal("window", { innerHeight: 800, visualViewport: { height: 400 } });
    const el = fakeElement({ top: 350, bottom: 450 });
    scrollIntoViewOnFocus(focusEvent(el));
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("keeps re-checking and scrolls once the field becomes covered mid-animation", () => {
    vi.stubGlobal("window", { innerHeight: 800, visualViewport: { height: 800 } });
    const el = fakeElement({ top: 500, bottom: 600 });
    scrollIntoViewOnFocus(focusEvent(el));
    expect(el.scrollIntoView).not.toHaveBeenCalled();

    // The keyboard finishes opening well after the immediate check — a
    // slow animation, or a native window resize that lands late.
    (window as unknown as { visualViewport: { height: number } }).visualViewport.height = 550;
    vi.advanceTimersByTime(1000);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("gives up after the watch window instead of polling forever", () => {
    vi.stubGlobal("window", { innerHeight: 800, visualViewport: { height: 400 } });
    const el = fakeElement({ top: 350, bottom: 450 });
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
