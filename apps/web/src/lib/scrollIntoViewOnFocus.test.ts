import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollIntoViewOnFocus } from "./scrollIntoViewOnFocus";

/**
 * No jsdom in this project — these build just enough of a fake DOM tree
 * (a focusable element, its ancestors up to a fake `document.body`, and a
 * `document.documentElement` carrying the `--keyboard-height` custom
 * property) for the function's own logic to run and be asserted on with
 * fake timers, without pulling in a full DOM.
 */
type FakeNode = {
  style: Record<string, string>;
  parentElement: FakeNode | null;
  overflowY?: string;
  clientHeight: number;
};

function fakeNode(overflowY: string | undefined, parent: FakeNode | null, clientHeight = 1000): FakeNode {
  return { style: {}, parentElement: parent, overflowY, clientHeight };
}

function fakeElement(rect: { top: number; bottom: number }, parent: FakeNode | null) {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    getBoundingClientRect: () => rect,
    scrollIntoView: vi.fn(),
    style: {} as Record<string, string>,
    parentElement: parent,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== cb);
    }),
    fireBlur() {
      for (const cb of listeners.blur ?? []) cb();
    },
  };
}

function focusEvent(el: ReturnType<typeof fakeElement>) {
  return { currentTarget: el } as unknown as React.FocusEvent<HTMLElement>;
}

function stubEnv(windowExtra: Record<string, unknown>, keyboardHeightPx: number, body: FakeNode) {
  const documentElement = {};
  vi.stubGlobal("window", { innerHeight: 800, ...windowExtra });
  vi.stubGlobal("document", { documentElement, body, scrollingElement: body });
  vi.stubGlobal("getComputedStyle", (node: unknown) => {
    if (node === documentElement) {
      return {
        getPropertyValue: (prop: string) =>
          prop === "--keyboard-height" ? `${keyboardHeightPx}px` : "",
      };
    }
    return { overflowY: (node as FakeNode).overflowY ?? "visible" };
  });
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
    const body = fakeNode(undefined, null);
    stubEnv({}, 0, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 100, bottom: 200 }, container);
    scrollIntoViewOnFocus(focusEvent(el));
    vi.advanceTimersByTime(2000);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls a field the --keyboard-height zone covers, even though the viewport itself never shrank", () => {
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 500, bottom: 600 }, container);
    scrollIntoViewOnFocus(focusEvent(el));
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "end", behavior: "smooth" });
  });

  it("sets scroll-margin-bottom on the field itself for the scrollIntoView call, then restores it", () => {
    // Container padding alone isn't enough: without scroll-margin,
    // scrollIntoView has no way to know the bottom kb pixels of the
    // container's own visible box are physically covered by the keyboard.
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 500, bottom: 600 }, container);
    let marginDuringCall = "";
    el.scrollIntoView = vi.fn(() => {
      marginDuringCall = el.style.scrollMarginBottom;
    });
    el.style.scrollMarginBottom = "original";
    scrollIntoViewOnFocus(focusEvent(el));
    expect(marginDuringCall).toBe("432px");
    expect(el.style.scrollMarginBottom).toBe("original");
  });

  it("pads the nearest scrolling ancestor by the keyboard height, not just the target field", () => {
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    // A plain wrapper div sits between the field and the actual scrolling
    // list — exactly the shape of the exercise-name field, nested inside
    // its drill's own body, inside .drills.
    const wrapper = fakeNode("visible", body);
    const container = fakeNode("auto", wrapper);
    const el = fakeElement({ top: 500, bottom: 600 }, container);
    scrollIntoViewOnFocus(focusEvent(el));
    expect(container.style.paddingBottom).toBe("432px");
    // The padding stays on the real scrolling ancestor while focused —
    // this is what gives a field with nothing below it somewhere to
    // scroll into that scroll-margin alone can't create.
    expect(el.style.paddingBottom).toBeUndefined();
  });

  it("restores the container's original padding once the field blurs", () => {
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body);
    container.style.paddingBottom = "12px";
    const el = fakeElement({ top: 500, bottom: 600 }, container);
    scrollIntoViewOnFocus(focusEvent(el));
    expect(container.style.paddingBottom).toBe("432px");
    el.fireBlur();
    expect(container.style.paddingBottom).toBe("12px");
  });

  it("falls back to the document's scrolling element when nothing between the field and body scrolls", () => {
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const plainWrapper = fakeNode("visible", body);
    const el = fakeElement({ top: 500, bottom: 600 }, plainWrapper);
    scrollIntoViewOnFocus(focusEvent(el));
    expect(body.style.paddingBottom).toBe("432px");
  });

  it("scrolls for a covered extraVisible element even when the field itself is fully visible", () => {
    // AutocompleteInput's own case: the field sits well clear of the
    // keyboard, but its suggestions dropdown — position: absolute, so it
    // doesn't affect the field's own rect at all — extends into it.
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 300, bottom: 340 }, container);
    const dropdown = { getBoundingClientRect: () => ({ top: 344, bottom: 560 }) };
    scrollIntoViewOnFocus(focusEvent(el), () => dropdown as unknown as HTMLElement);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("sizes the scroll margin to cover the dropdown's own overhang past the field, not just the keyboard", () => {
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 300, bottom: 340 }, container);
    const dropdown = { getBoundingClientRect: () => ({ top: 344, bottom: 560 }) };
    let marginDuringCall = "";
    el.scrollIntoView = vi.fn(() => {
      marginDuringCall = el.style.scrollMarginBottom;
    });
    scrollIntoViewOnFocus(focusEvent(el), () => dropdown as unknown as HTMLElement);
    // overhang = 560 - 340 = 220, plus kb (400) plus the usual 32px margin.
    expect(marginDuringCall).toBe("652px");
  });

  it("caps the scroll margin at what a short container can spare, rather than cropping the field's own top", () => {
    // A container shorter than kb + margin — the muscle picker's own
    // "add exercise" field, once the "pair between sets" list above it
    // has eaten most of the panel's height. Without a cap, block: "end"
    // would still ask to fit the full 432px margin, which pushes the
    // field's own top out of the container's visible box instead of
    // leaving a little of the keyboard clearance uncovered.
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body, 150);
    const el = fakeElement({ top: 500, bottom: 540 }, container);
    let marginDuringCall = "";
    el.scrollIntoView = vi.fn(() => {
      marginDuringCall = el.style.scrollMarginBottom;
    });
    scrollIntoViewOnFocus(focusEvent(el));
    // maxMargin = 150 (clientHeight) - 40 (field height) = 110, well under
    // the 432px the keyboard + margin alone would ask for.
    expect(marginDuringCall).toBe("110px");
  });

  it("notices a dropdown that appears mid-poll, not just one present at focus time", () => {
    // The dropdown doesn't exist in the DOM until there's a match to show —
    // re-querying for it every tick (rather than once, at focus) is what
    // lets this react once it actually mounts.
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 300, bottom: 340 }, container);
    let dropdown: { getBoundingClientRect: () => { top: number; bottom: number } } | null = null;
    scrollIntoViewOnFocus(focusEvent(el), () => dropdown as unknown as HTMLElement | null);
    expect(el.scrollIntoView).not.toHaveBeenCalled();

    dropdown = { getBoundingClientRect: () => ({ top: 344, bottom: 560 }) };
    vi.advanceTimersByTime(200);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("still uses visualViewport/innerHeight when --keyboard-height is 0 (iOS, desktop, the plain website)", () => {
    const body = fakeNode(undefined, null);
    stubEnv({ visualViewport: { height: 400 } }, 0, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 350, bottom: 450 }, container);
    scrollIntoViewOnFocus(focusEvent(el));
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("gives up after the watch window instead of polling forever", () => {
    const body = fakeNode(undefined, null);
    stubEnv({}, 400, body);
    const container = fakeNode("auto", body);
    const el = fakeElement({ top: 500, bottom: 600 }, container);
    scrollIntoViewOnFocus(focusEvent(el));
    const callsSoFar = el.scrollIntoView.mock.calls.length;

    vi.advanceTimersByTime(5000);
    const totalCalls = el.scrollIntoView.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(callsSoFar);

    vi.advanceTimersByTime(5000);
    expect(el.scrollIntoView.mock.calls.length).toBe(totalCalls);
  });
});
